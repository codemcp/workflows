/**
 * Project Docs Manager
 *
 * Manages project documentation artifacts (architecture.md, requirements.md, design.md)
 * separate from the workflow-specific plan files. Handles creation, validation, and
 * path resolution for project documents. Now supports both template creation and
 * file linking via symlinks.
 */

import {
  writeFile,
  access,
  mkdir,
  unlink,
  symlink,
  lstat,
  stat,
  readdir,
} from 'node:fs/promises';
import { join, dirname, relative, extname, basename } from 'node:path';
import { createLogger, ILogger } from './logger.js';
import { TemplateManager, TemplateOptions } from './template-manager.js';

const defaultLogger = createLogger('ProjectDocsManager');

export interface ProjectDocsInfo {
  architecture: { path: string; exists: boolean };
  requirements: { path: string; exists: boolean };
  design: { path: string; exists: boolean };
}

export interface CreateOrLinkResult {
  created: string[];
  linked: string[];
  skipped: string[];
}

export class ProjectDocsManager {
  public templateManager: TemplateManager; // Make public for access from other classes
  private logger: ILogger;

  constructor(logger: ILogger = defaultLogger) {
    this.templateManager = new TemplateManager();
    this.logger = logger;
  }

  /**
   * Get project docs directory path
   */
  getDocsPath(projectPath: string): string {
    return join(projectPath, '.vibe', 'docs');
  }

  /**
   * Determine the appropriate extension for a document based on source path
   */
  private async getDocumentExtension(sourcePath?: string): Promise<string> {
    if (!sourcePath) {
      return '.md'; // Default for templates
    }

    try {
      const stats = await stat(sourcePath);

      if (stats.isDirectory()) {
        return ''; // No extension for directories
      }

      // For files, preserve the original extension
      const ext = extname(sourcePath);
      return ext || '.md'; // Default to .md if no extension
    } catch (_error) {
      return '.md'; // Default if we can't stat the source
    }
  }

  /**
   * Get the target filename for a document type
   */
  private async getDocumentFilename(
    type: 'architecture' | 'requirements' | 'design',
    sourcePath?: string
  ): Promise<string> {
    const extension = await this.getDocumentExtension(sourcePath);

    // Always use the standardized document type name
    // This ensures consistent symlink names regardless of source path
    return extension === '' ? type : `${type}${extension}`;
  }

  /**
   * Get paths for all project documents
   */
  getDocumentPaths(projectPath: string): {
    architecture: string;
    requirements: string;
    design: string;
  } {
    const docsPath = this.getDocsPath(projectPath);
    return {
      architecture: join(docsPath, 'architecture.md'),
      requirements: join(docsPath, 'requirements.md'),
      design: join(docsPath, 'design.md'),
    };
  }

  /**
   * Get paths for all project documents with dynamic extensions based on source paths
   */
  async getDocumentPathsWithExtensions(
    projectPath: string,
    sourcePaths?: Partial<{
      architecture: string;
      requirements: string;
      design: string;
    }>
  ): Promise<{
    architecture: string;
    requirements: string;
    design: string;
  }> {
    const docsPath = this.getDocsPath(projectPath);

    const archFilename = await this.getDocumentFilename(
      'architecture',
      sourcePaths?.architecture
    );
    const reqFilename = await this.getDocumentFilename(
      'requirements',
      sourcePaths?.requirements
    );
    const designFilename = await this.getDocumentFilename(
      'design',
      sourcePaths?.design
    );

    return {
      architecture: join(docsPath, archFilename),
      requirements: join(docsPath, reqFilename),
      design: join(docsPath, designFilename),
    };
  }

  /**
   * Check which project documents exist
   */
  async getProjectDocsInfo(projectPath: string): Promise<ProjectDocsInfo> {
    const paths = this.getDocumentPaths(projectPath);

    const checkExists = async (path: string): Promise<boolean> => {
      try {
        await access(path);
        return true;
      } catch (_error) {
        return false;
      }
    };

    // Check for documents with different extensions using simple logic
    const checkExistsWithExtensions = async (
      basePath: string,
      docType: string
    ): Promise<{ exists: boolean; actualPath: string }> => {
      // First check the default .md path
      if (await checkExists(basePath)) {
        return { exists: true, actualPath: basePath };
      }

      // Check for the document type with any extension or as directory
      const docsDir = dirname(basePath);

      try {
        const entries = await readdir(docsDir);

        // Look for entries that match the document type exactly or start with it
        for (const entry of entries) {
          const entryWithoutExt = entry.replace(/\.[^/.]+$/, '');

          if (entryWithoutExt === docType || entry === docType) {
            const entryPath = join(docsDir, entry);
            if (await checkExists(entryPath)) {
              return { exists: true, actualPath: entryPath };
            }
          }
        }
      } catch (_error) {
        // Directory might not exist yet
      }

      return { exists: false, actualPath: basePath };
    };

    const archResult = await checkExistsWithExtensions(
      paths.architecture,
      'architecture'
    );
    const reqResult = await checkExistsWithExtensions(
      paths.requirements,
      'requirements'
    );
    const designResult = await checkExistsWithExtensions(
      paths.design,
      'design'
    );

    return {
      architecture: {
        path: archResult.actualPath,
        exists: archResult.exists,
      },
      requirements: {
        path: reqResult.actualPath,
        exists: reqResult.exists,
      },
      design: {
        path: designResult.actualPath,
        exists: designResult.exists,
      },
    };
  }

  /**
   * Create project documents using templates (legacy method for backward compatibility)
   */
  async createProjectDocs(
    projectPath: string,
    options?: TemplateOptions
  ): Promise<{ created: string[]; skipped: string[] }> {
    const result = await this.createOrLinkProjectDocs(projectPath, options, {});
    return {
      created: result.created,
      skipped: result.skipped,
    };
  }

  /**
   * Create or link project documents using templates and/or file paths
   */
  async createOrLinkProjectDocs(
    projectPath: string,
    templateOptions?: Partial<TemplateOptions>,
    filePaths?: Partial<{
      architecture: string;
      requirements: string;
      design: string;
    }>
  ): Promise<CreateOrLinkResult> {
    const defaults = await this.templateManager.getDefaults();
    const finalTemplateOptions = { ...defaults, ...templateOptions };

    const docsPath = this.getDocsPath(projectPath);

    // Use dynamic paths that consider source file extensions
    const paths = await this.getDocumentPathsWithExtensions(
      projectPath,
      filePaths
    );

    // Check existing documents using the old static paths for backward compatibility

    const info = await this.getProjectDocsInfo(projectPath);

    // Ensure docs directory exists
    await mkdir(docsPath, { recursive: true });

    const created: string[] = [];
    const linked: string[] = [];
    const skipped: string[] = [];

    // Handle architecture document
    if (!info.architecture.exists) {
      if (filePaths?.architecture) {
        await this.createSymlink(filePaths.architecture, paths.architecture);
        const filename = basename(paths.architecture);
        linked.push(filename);
      } else {
        await this.createDocument(
          'architecture',
          finalTemplateOptions.architecture,
          paths.architecture,
          docsPath
        );
        const filename = basename(paths.architecture);
        created.push(filename);
      }
    } else {
      skipped.push('architecture.md');
    }

    // Handle requirements document
    if (!info.requirements.exists) {
      if (filePaths?.requirements) {
        await this.createSymlink(filePaths.requirements, paths.requirements);
        const filename = basename(paths.requirements);
        linked.push(filename);
      } else {
        await this.createDocument(
          'requirements',
          finalTemplateOptions.requirements,
          paths.requirements,
          docsPath
        );
        const filename = basename(paths.requirements);
        created.push(filename);
      }
    } else {
      skipped.push('requirements.md');
    }

    // Handle design document
    if (!info.design.exists) {
      if (filePaths?.design) {
        await this.createSymlink(filePaths.design, paths.design);
        const filename = basename(paths.design);
        linked.push(filename);
      } else {
        await this.createDocument(
          'design',
          finalTemplateOptions.design,
          paths.design,
          docsPath
        );
        const filename = basename(paths.design);
        created.push(filename);
      }
    } else {
      skipped.push('design.md');
    }

    this.logger.info('Project docs creation/linking completed', {
      created,
      linked,
      skipped,
      projectPath,
      templateOptions: finalTemplateOptions,
      filePaths,
    });

    return { created, linked, skipped };
  }

  /**
   * Create a symlink to an existing file
   */
  async createSymlink(sourcePath: string, targetPath: string): Promise<void> {
    try {
      // Remove existing file/symlink if it exists
      await this.removeExistingDocument(targetPath);

      // Create relative symlink for better portability
      const targetDir = dirname(targetPath);
      const relativePath = relative(targetDir, sourcePath);

      await symlink(relativePath, targetPath);

      this.logger.debug('Symlink created successfully', {
        sourcePath,
        targetPath,
        relativePath,
      });
    } catch (error) {
      this.logger.error('Failed to create symlink', error as Error, {
        sourcePath,
        targetPath,
      });
      throw new Error(
        `Failed to create symlink: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Remove existing document or symlink
   */
  private async removeExistingDocument(documentPath: string): Promise<void> {
    try {
      const stats = await lstat(documentPath);
      await unlink(documentPath);

      this.logger.debug('Existing document removed', {
        documentPath,
        wasSymlink: stats.isSymbolicLink(),
      });
    } catch (error) {
      // File doesn't exist, which is fine
      const nodeError = error as NodeJS.ErrnoException;
      if (
        error instanceof Error &&
        'code' in nodeError &&
        nodeError.code !== 'ENOENT'
      ) {
        this.logger.debug('Failed to remove existing document', {
          documentPath,
          error: nodeError.message,
        });
      }
    }
  }

  /**
   * Create a single document from template
   */
  private async createDocument(
    type: 'architecture' | 'requirements' | 'design',
    template: string,
    documentPath: string,
    docsPath: string
  ): Promise<void> {
    try {
      const templateResult = await this.templateManager.loadTemplate(
        type,
        template
      );

      // Write the main document
      await writeFile(documentPath, templateResult.content, 'utf-8');

      // Write additional files (like images for arc42)
      if (templateResult.additionalFiles) {
        for (const file of templateResult.additionalFiles) {
          const filePath = join(docsPath, file.relativePath);
          const fileDir = dirname(filePath);

          // Ensure directory exists
          await mkdir(fileDir, { recursive: true });

          // Write file
          await writeFile(filePath, file.content.toString());
        }
      }

      this.logger.debug(`Created ${type} document`, { documentPath, template });
    } catch (error) {
      this.logger.error(`Failed to create ${type} document`, error as Error, {
        documentPath,
        template,
      });
      throw error;
    }
  }

  /**
   * Get variable substitutions for workflow instructions
   */
  getVariableSubstitutions(
    projectPath: string,
    gitBranch?: string
  ): Record<string, string> {
    const paths = this.getDocumentPaths(projectPath);

    // Create branch directory path under .vibe/ (similar to docs structure)
    const branchDirName = gitBranch || 'main';
    const vibeDir = join(projectPath, '.vibe');

    // Get agent role from environment variable for crowd workflows
    const agentRole = process.env['VIBE_ROLE'] || '';

    return {
      $ARCHITECTURE_DOC: paths.architecture,
      $REQUIREMENTS_DOC: paths.requirements,
      $DESIGN_DOC: paths.design,
      $VIBE_DIR: vibeDir,
      $BRANCH_NAME: branchDirName,
      $VIBE_ROLE: agentRole,
    };
  }

  /**
   * Get variable substitutions for workflow instructions with dynamic paths
   */
  async getVariableSubstitutionsWithExtensions(
    projectPath: string,
    sourcePaths?: Partial<{
      architecture: string;
      requirements: string;
      design: string;
    }>
  ): Promise<Record<string, string>> {
    const paths = await this.getDocumentPathsWithExtensions(
      projectPath,
      sourcePaths
    );

    return {
      $ARCHITECTURE_DOC: paths.architecture,
      $REQUIREMENTS_DOC: paths.requirements,
      $DESIGN_DOC: paths.design,
    };
  }

  /**
   * Read a project document - returns the path for LLM to read as needed
   */
  async readDocument(
    projectPath: string,
    type: 'architecture' | 'requirements' | 'design'
  ): Promise<string> {
    // Use the dynamic path detection to get the actual document path
    const docsInfo = await this.getProjectDocsInfo(projectPath);
    const documentPath = docsInfo[type].path;

    if (!docsInfo[type].exists) {
      throw new Error(`${type} document not found: ${documentPath}`);
    }

    // Return the pure path for the LLM to read as needed
    // This is more efficient for large documents and gives LLM full control
    return documentPath;
  }

  /**
   * Check if all project documents exist
   */
  async allDocumentsExist(projectPath: string): Promise<boolean> {
    const info = await this.getProjectDocsInfo(projectPath);
    return (
      info.architecture.exists && info.requirements.exists && info.design.exists
    );
  }

  /**
   * Check if a document is a symlink
   */
  async isSymlink(
    projectPath: string,
    type: 'architecture' | 'requirements' | 'design'
  ): Promise<boolean> {
    const paths = this.getDocumentPaths(projectPath);
    const documentPath = paths[type];

    try {
      const stats = await lstat(documentPath);
      return stats.isSymbolicLink();
    } catch (_error) {
      return false;
    }
  }
}
