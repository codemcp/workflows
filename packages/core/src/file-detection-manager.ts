/**
 * File Detection Manager
 *
 * Handles pattern-based file discovery and suggestions for existing documentation files.
 * Supports auto-detection of common documentation patterns in projects.
 */

import { readdir, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createLogger } from './logger.js';
import { PathValidationUtils } from './path-validation-utils.js';

const logger = createLogger('FileDetectionManager');

export interface DetectedFile {
  path: string;
  relativePath: string;
  type: 'architecture' | 'requirements' | 'design';
  confidence: 'high' | 'medium' | 'low';
}

export interface FileDetectionResult {
  architecture: DetectedFile[];
  requirements: DetectedFile[];
  design: DetectedFile[];
}

export class FileDetectionManager {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Detect existing documentation files in the project
   */
  async detectDocumentationFiles(): Promise<FileDetectionResult> {
    logger.debug('Starting documentation file detection', {
      projectPath: this.projectPath,
    });

    const searchLocations = this.getSearchLocations();
    const patterns = PathValidationUtils.getCommonDocumentationPatterns();

    const result: FileDetectionResult = {
      architecture: [],
      requirements: [],
      design: [],
    };

    // Search in each location
    for (const location of searchLocations) {
      try {
        await access(location);
        const files = await this.scanLocation(location);

        // Match files against patterns
        for (const file of files) {
          const matches = this.matchFileToPatterns(file, patterns);

          for (const match of matches) {
            result[match.type].push({
              path: file.path,
              relativePath: file.relativePath,
              type: match.type,
              confidence: match.confidence,
            });
          }
        }
      } catch (error) {
        logger.debug('Search location not accessible', {
          location,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Sort by confidence and remove duplicates
    result.architecture = this.sortAndDeduplicate(result.architecture);
    result.requirements = this.sortAndDeduplicate(result.requirements);
    result.design = this.sortAndDeduplicate(result.design);

    logger.info('Documentation file detection completed', {
      found: {
        architecture: result.architecture.length,
        requirements: result.requirements.length,
        design: result.design.length,
      },
    });

    return result;
  }

  /**
   * Get search locations for documentation files
   */
  private getSearchLocations(): string[] {
    return [
      this.projectPath, // Project root
      join(this.projectPath, 'docs'), // docs/ folder
      join(this.projectPath, 'doc'), // doc/ folder
      join(this.projectPath, '.vibe', 'docs'), // .vibe/docs/ folder
      join(this.projectPath, 'documentation'), // documentation/ folder
    ];
  }

  /**
   * Scan a location for files
   */
  private async scanLocation(
    location: string
  ): Promise<Array<{ path: string; relativePath: string }>> {
    try {
      const entries = await readdir(location, { withFileTypes: true });
      const files: Array<{ path: string; relativePath: string }> = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = join(location, entry.name);
          const relativePath = fullPath.replace(this.projectPath + '/', '');

          files.push({
            path: fullPath,
            relativePath,
          });
        }
      }

      return files;
    } catch (error) {
      logger.debug('Failed to scan location', {
        location,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Match a file against documentation patterns
   */
  private matchFileToPatterns(
    file: { path: string; relativePath: string },
    patterns: ReturnType<
      typeof PathValidationUtils.getCommonDocumentationPatterns
    >
  ): Array<{
    type: 'architecture' | 'requirements' | 'design';
    confidence: 'high' | 'medium' | 'low';
  }> {
    const fileName = basename(file.path).toLowerCase();
    const relativePath = file.relativePath.toLowerCase();
    const matches: Array<{
      type: 'architecture' | 'requirements' | 'design';
      confidence: 'high' | 'medium' | 'low';
    }> = [];

    // Check architecture patterns
    if (this.matchesPatterns(fileName, relativePath, patterns.architecture)) {
      const confidence = this.getConfidence(fileName, 'architecture');
      matches.push({ type: 'architecture', confidence });
    }

    // Check requirements patterns
    if (this.matchesPatterns(fileName, relativePath, patterns.requirements)) {
      const confidence = this.getConfidence(fileName, 'requirements');
      matches.push({ type: 'requirements', confidence });
    }

    // Check design patterns
    if (this.matchesPatterns(fileName, relativePath, patterns.design)) {
      const confidence = this.getConfidence(fileName, 'design');
      matches.push({ type: 'design', confidence });
    }

    return matches;
  }

  /**
   * Check if file matches any of the patterns
   */
  private matchesPatterns(
    fileName: string,
    relativePath: string,
    patterns: string[]
  ): boolean {
    return patterns.some(pattern => {
      const normalizedPattern = pattern.toLowerCase();

      // Exact filename match
      if (fileName === normalizedPattern) {
        return true;
      }

      // Relative path match
      if (relativePath === normalizedPattern) {
        return true;
      }

      // Pattern matching with wildcards
      if (normalizedPattern.includes('*')) {
        const regex = new RegExp(normalizedPattern.replace(/\*/g, '.*'));
        return regex.test(fileName) || regex.test(relativePath);
      }

      return false;
    });
  }

  /**
   * Determine confidence level for a match
   */
  private getConfidence(
    fileName: string,
    type: string
  ): 'high' | 'medium' | 'low' {
    // High confidence for exact type matches
    if (fileName.includes(type.toLowerCase())) {
      return 'high';
    }

    // Medium confidence for README files (could contain any type)
    if (fileName.includes('readme')) {
      return 'medium';
    }

    // Low confidence for other matches
    return 'low';
  }

  /**
   * Sort by confidence and remove duplicates
   */
  private sortAndDeduplicate(files: DetectedFile[]): DetectedFile[] {
    // Remove duplicates by path
    const unique = files.filter(
      (file, index, array) =>
        array.findIndex(f => f.path === file.path) === index
    );

    // Sort by confidence (high first) and then by path length (shorter first)
    return unique.sort((a, b) => {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      const confidenceDiff =
        confidenceOrder[a.confidence] - confidenceOrder[b.confidence];

      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }

      return a.relativePath.length - b.relativePath.length;
    });
  }

  /**
   * Format file suggestions for LLM responses
   */
  formatSuggestions(detectionResult: FileDetectionResult): string {
    const found: string[] = [];

    if (detectionResult.architecture.length > 0) {
      found.push(
        `architecture: ${detectionResult.architecture
          .slice(0, 2)
          .map(f => f.relativePath)
          .join(', ')}`
      );
    }
    if (detectionResult.requirements.length > 0) {
      found.push(
        `requirements: ${detectionResult.requirements
          .slice(0, 2)
          .map(f => f.relativePath)
          .join(', ')}`
      );
    }
    if (detectionResult.design.length > 0) {
      found.push(
        `design: ${detectionResult.design
          .slice(0, 2)
          .map(f => f.relativePath)
          .join(', ')}`
      );
    }

    if (found.length === 0) {
      return 'No existing documentation files detected.';
    }

    return `Found: ${found.join('; ')}. Link existing files via \`setup_project_docs({ architecture: "path/to/file.md" })\` or use template names.`;
  }
}
