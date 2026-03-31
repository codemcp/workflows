/**
 * Plan Manager Interface
 *
 * Defines the contract for plan management functionality.
 * Enables strategy pattern implementation for different task backends.
 */

import type { YamlStateMachine } from '../state-machine-types.js';
import type { TaskBackendConfig } from '../task-backend.js';

export interface PlanFileInfo {
  path: string;
  exists: boolean;
  content?: string;
}

/**
 * Interface for plan management operations
 * All plan managers must implement this interface
 */
export interface IPlanManager {
  /**
   * Set the state machine definition for dynamic plan generation
   */
  setStateMachine(stateMachine: YamlStateMachine): void;

  /**
   * Set the task backend configuration
   */
  setTaskBackend(taskBackend: TaskBackendConfig): void;

  /**
   * Get plan file information
   */
  getPlanFileInfo(planFilePath: string): Promise<PlanFileInfo>;

  /**
   * Create initial plan file if it doesn't exist
   */
  ensurePlanFile(
    planFilePath: string,
    projectPath: string,
    gitBranch: string
  ): Promise<void>;

  /**
   * Update plan file with new content
   */
  updatePlanFile(planFilePath: string, content: string): Promise<void>;

  /**
   * Get plan file content for LLM context
   */
  getPlanFileContent(planFilePath: string): Promise<string>;

  /**
   * Generate phase-specific plan file guidance based on state machine
   */
  generatePlanFileGuidance(phase: string): string;

  /**
   * Delete plan file
   */
  deletePlanFile(planFilePath: string): Promise<boolean>;

  /**
   * Ensure plan file is deleted (verify deletion)
   */
  ensurePlanFileDeleted(planFilePath: string): Promise<boolean>;

  /**
   * Generate base instructions for the LLM after a workflow is started.
   * Instructs the LLM to populate the Goal section and define phase entrance
   * criteria in the freshly created plan file.
   *
   * @param planFilePath - Path to the plan file
   * @param workflowDocUrl - Optional URL for workflow documentation
   */
  getInitialPlanGuidance(planFilePath: string, workflowDocUrl?: string): string;
}
