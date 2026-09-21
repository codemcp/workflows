/**
 * Server Configuration
 *
 * Handles server configuration, component initialization, and MCP server setup.
 * Centralizes the configuration logic that was previously scattered in the main server class.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as path from 'node:path';

import { FileStorage } from '@codemcp/workflows-core';
import type { IPersistence } from '@codemcp/workflows-core';
import { ConversationManager } from '@codemcp/workflows-core';
import { TransitionEngine } from '@codemcp/workflows-core';
import { InteractionLogger } from '@codemcp/workflows-core';
import { WorkflowManager } from '@codemcp/workflows-core';
import { TemplateManager } from '@codemcp/workflows-core';
import {
  createLogger,
  setLoggingLevelFromString,
  DOMAIN_DESCRIPTIONS,
  KNOWN_DOMAIN_NAMES,
} from '@codemcp/workflows-core';

import {
  ServerConfig,
  ServerContext,
  ToolRegistry,
  ResponseRenderer,
} from './types.js';
import {
  normalizeProjectPath,
  buildWorkflowEnum,
  generateWorkflowDescription,
} from './server-helpers.js';
import { PlanManager, InstructionGenerator } from '@codemcp/workflows-core';

const logger = createLogger('ServerConfig');

/**
 * Server component container
 * Holds all the initialized server components
 */
export interface ServerComponents {
  mcpServer: McpServer;
  database: IPersistence;
  context: ServerContext;
  toolRegistry?: ToolRegistry;
  responseRenderer?: ResponseRenderer;
}

/**
 * Initialize all server components
 */
export async function initializeServerComponents(
  config: ServerConfig = {}
): Promise<ServerComponents> {
  logger.debug('Initializing server components', {
    config: JSON.stringify(config),
  });

  // Set project path with support for environment variable
  const projectPath = normalizeProjectPath(
    config.projectPath || process.env.PROJECT_PATH
  );

  logger.info('Using project path', {
    projectPath,
    source: config.projectPath
      ? 'config'
      : process.env.PROJECT_PATH
        ? 'env'
        : 'default',
  });

  // Initialize MCP server
  const mcpServer = new McpServer(
    {
      name: 'workflows',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  // Register logging/setLevel handler to support MCP inspector
  mcpServer.server.setRequestHandler(SetLevelRequestSchema, async request => {
    const level = request.params.level;
    logger.info('Setting logging level from MCP client', { level });

    // Set the unified logging level
    setLoggingLevelFromString(level);

    return {};
  });

  // Initialize core components
  logger.debug('Initializing core components');
  const database = new FileStorage(
    path.join(projectPath, '.vibe', 'conversation.sqlite')
  );
  const workflowManager = new WorkflowManager();
  const conversationManager = new ConversationManager(
    database,
    workflowManager,
    projectPath
  );
  const transitionEngine = new TransitionEngine(projectPath);
  transitionEngine.setConversationManager(conversationManager);

  // Always use PlanManager - beads-specific plan format happens via afterPlanFileCreated hook
  const planManager = new PlanManager();
  // Always use InstructionGenerator - beads-specific enrichment happens via afterInstructionsGenerated hook
  const instructionGenerator = new InstructionGenerator();

  // Always create interaction logger as it's critical for transition engine logic
  // (determining first call from initial state)
  const interactionLogger = new InteractionLogger(database);

  // Create server context
  const context: ServerContext = {
    conversationManager,
    transitionEngine,
    planManager,
    instructionGenerator,
    workflowManager,
    interactionLogger,
    projectPath,
  };

  // Initialize database
  await database.initialize();

  // Load project workflows before tool registration
  workflowManager.loadProjectWorkflows(projectPath);

  logger.info('Server components initialized successfully');

  return {
    mcpServer,
    database,
    context,
    toolRegistry: undefined as unknown as ToolRegistry,
    responseRenderer: undefined as unknown as ResponseRenderer,
  };
}

/**
 * Helper function to create tool handlers with consistent error handling
 */
function createToolHandler(
  toolName: string,
  toolRegistry: ToolRegistry,
  responseRenderer: ResponseRenderer,
  context: ServerContext
) {
  return async (args: unknown) => {
    const handler = toolRegistry.get(toolName);
    if (!handler) {
      return responseRenderer.renderError(
        `Tool handler not found: ${toolName}`
      );
    }

    const result = await handler.handle(args, context);
    return responseRenderer.renderToolResponse(result);
  };
}

/**
 * Register MCP tools with the server
 */
export async function registerMcpTools(
  mcpServer: McpServer,
  toolRegistry: ToolRegistry,
  responseRenderer: ResponseRenderer,
  context: ServerContext
): Promise<void> {
  logger.debug('Registering MCP tools');

  // Register whats_next tool
  mcpServer.registerTool(
    'whats_next',
    {
      description:
        'Get guidance for the current development phase and determine what to work on next. Call this tool after each user message to receive phase-specific instructions and check if you should transition to the next development phase. The tool will reference your plan file for specific tasks and context.',
      inputSchema: {
        context: z
          .string()
          .optional()
          .describe(
            "Brief description of what you're currently working on or discussing with the user"
          ),
        user_input: z
          .string()
          .optional()
          .describe("The user's most recent message or request"),
        conversation_summary: z
          .string()
          .optional()
          .describe(
            'Summary of the development progress and key decisions made so far'
          ),
        recent_messages: z
          .array(
            z.object({
              role: z
                .enum(['user', 'assistant'])
                .describe('Who sent the message (user or assistant)'),
              content: z.string().describe('The message content'),
            })
          )
          .optional()
          .describe(
            'Recent conversation messages that provide context for the current development state'
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. Overrides the server default project path.'
          ),
      },
      annotations: {
        title: 'Development Phase Analyzer',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    createToolHandler('whats_next', toolRegistry, responseRenderer, context)
  );

  // Register proceed_to_phase tool
  mcpServer.registerTool(
    'proceed_to_phase',
    {
      description:
        'Move to a specific development phase when the current phase is complete. Use this tool to explicitly transition between phases. Check your plan file to see available phases for the current workflow. Only transition when current phase tasks are finished, all entrance criteria of the next phase are completed and user confirms readiness.',
      inputSchema: {
        target_phase: z
          .string()
          .describe(
            'The development phase to move to. Check your plan file section headers to see available phases for the current workflow'
          ),
        reason: z
          .string()
          .optional()
          .describe(
            'Why you\'re moving to this phase now (e.g., "requirements complete", "user approved design", "implementation finished")'
          ),
        review_state: z
          .enum(['not-required', 'pending', 'performed'])
          .describe(
            'Review state for transitions that require reviews. Use "not-required" when reviews are disabled, "pending" when review is needed, "performed" when review is complete.'
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. Overrides the server default project path.'
          ),
      },
      annotations: {
        title: 'Phase Transition Controller',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'proceed_to_phase',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register conduct_review tool
  mcpServer.registerTool(
    'conduct_review',
    {
      description:
        'Conduct a review of the current phase before proceeding to the next phase. This tool analyzes artifacts and decisions from the current phase using defined review perspectives. Use this tool when reviews are required before phase transitions.',
      inputSchema: {
        target_phase: z
          .string()
          .describe(
            'The target phase you want to transition to after the review is complete'
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. Overrides the server default project path.'
          ),
      },
      annotations: {
        title: 'Phase Review Conductor',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler('conduct_review', toolRegistry, responseRenderer, context)
  );

  // Register start_development tool
  mcpServer.registerTool(
    'start_development',
    {
      description:
        'Begin a new development project with a structured workflow. Choose from different development approaches (waterfall, bugfix, epcc) or use a custom workflow. This tool sets up the project plan and initializes the development process.',
      inputSchema: {
        workflow: z
          .enum(buildWorkflowEnum(context.workflowManager.getWorkflowNames()))
          .describe(
            generateWorkflowDescription(
              context.workflowManager.getAvailableWorkflows()
            )
          ),
        require_reviews: z
          .boolean()
          .optional()
          .describe(
            'Whether to require reviews before phase transitions. When enabled, use conduct_review tool before proceeding to next phase.'
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. The implementation will automatically detect and use the correct project root.'
          ),
      },
      annotations: {
        title: 'Development Initializer',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'start_development',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register resume_workflow tool
  mcpServer.registerTool(
    'resume_workflow',
    {
      description:
        'Continue development after a break or conversation restart. This tool provides complete project context, current development status, and next steps to seamlessly pick up where you left off. Use when starting a new conversation about an existing project.',
      inputSchema: {
        include_system_prompt: z
          .boolean()
          .optional()
          .describe(
            'Whether to include setup instructions for the assistant (default: true)'
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. Overrides the server default project path.'
          ),
      },
      annotations: {
        title: 'Workflow Resumption Assistant',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'resume_workflow',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register reset_development tool
  mcpServer.registerTool(
    'reset_development',
    {
      description:
        'Start over with a clean slate by deleting all development progress and conversation history. This permanently removes the project plan and resets the development state. Use when you want to completely restart the development approach for a project.',
      inputSchema: {
        confirm: z
          .boolean()
          .describe(
            'Must be true to execute reset - prevents accidental resets'
          ),
        reason: z
          .string()
          .optional()
          .describe('Optional reason for reset (for logging and audit trail)'),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. Overrides the server default project path.'
          ),
      },
      annotations: {
        title: 'Development Reset Tool',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'reset_development',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  // Register list_workflows tool
  mcpServer.registerTool(
    'list_workflows',
    {
      description:
        'Get an overview of available workflows. Returns only loaded workflows (respecting domain filtering).',
      inputSchema: {},
      annotations: {
        title: 'Workflow Overview Tool',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler('list_workflows', toolRegistry, responseRenderer, context)
  );

  // Register load_workflows tool — allows LLM to dynamically switch domains
  const domainList = Object.entries(DOMAIN_DESCRIPTIONS)
    .map(([d, desc]) => `${d}: ${desc}`)
    .join(' | ');

  mcpServer.registerTool(
    'load_workflows',
    {
      description: `Load workflows from one or more domains. Replaces the current domain set. Available domains — ${domainList}`,
      inputSchema: {
        domains: z
          .array(z.enum(KNOWN_DOMAIN_NAMES))
          .describe('Domain names to load.'),
      },
      annotations: {
        title: 'Workflow Domain Loader',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    createToolHandler('load_workflows', toolRegistry, responseRenderer, context)
  );

  // Register setup_project_docs tool with enhanced file linking support
  const templateManager = new TemplateManager();
  const availableTemplates = await templateManager.getAvailableTemplates();

  mcpServer.registerTool(
    'setup_project_docs',
    {
      description:
        'Create or link project docs (architecture.md, requirements.md, design.md). Use template names or file paths.',
      inputSchema: {
        architecture: z
          .string()
          .default('freestyle')
          .describe(
            `Architecture documentation: template name (${availableTemplates.architecture.join(', ')}, none) OR file path to existing document`
          ),
        requirements: z
          .string()
          .default('none')
          .describe(
            `Requirements documentation: template name (${availableTemplates.requirements.join(', ')}, none) OR file path to existing document`
          ),
        design: z
          .string()
          .default('freestyle')
          .describe(
            `Design documentation: template name (${availableTemplates.design.join(', ')}, none) OR file path to existing document`
          ),
        project_path: z
          .string()
          .optional()
          .describe(
            'Project directory path. Pass the .vibe subdirectory path if a .vibe directory exists in your project, otherwise pass the project root directory. The implementation will automatically detect and use the correct project root.'
          ),
      },
      annotations: {
        title: 'Project Documentation Setup Tool',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    createToolHandler(
      'setup_project_docs',
      toolRegistry,
      responseRenderer,
      context
    )
  );

  logger.info('MCP tools registered successfully', {
    tools: toolRegistry.list(),
  });
}
