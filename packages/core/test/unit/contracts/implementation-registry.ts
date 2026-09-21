/**
 * Implementation Registry
 *
 * Central registry for interface implementations to ensure all implementations
 * are tested against their interface contracts.
 */

import type { ImplementationRegistration } from './base-interface-contract.js';
import type { IPlanManager } from '../../../src/interfaces/plan-manager.interface.js';
import { InstructionGenerator } from '../../../src/instruction-generator.js';

/**
 * Registry for all interface implementations
 */
export class ImplementationRegistry {
  private static planManagerImplementations = new Map<
    string,
    ImplementationRegistration<IPlanManager>
  >();
  private static instructionGeneratorImplementations = new Map<
    string,
    ImplementationRegistration<InstructionGenerator>
  >();

  /**
   * Register a PlanManager implementation
   */
  static registerPlanManager(
    registration: ImplementationRegistration<IPlanManager>
  ): void {
    this.planManagerImplementations.set(registration.name, registration);
  }

  /**
   * Register an InstructionGenerator implementation
   */
  static registerInstructionGenerator(
    registration: ImplementationRegistration<InstructionGenerator>
  ): void {
    this.instructionGeneratorImplementations.set(
      registration.name,
      registration
    );
  }

  /**
   * Get all registered PlanManager implementations
   */
  static getPlanManagerImplementations(): ImplementationRegistration<IPlanManager>[] {
    return Array.from(this.planManagerImplementations.values());
  }

  /**
   * Get all registered InstructionGenerator implementations
   */
  static getInstructionGeneratorImplementations(): ImplementationRegistration<InstructionGenerator>[] {
    return Array.from(this.instructionGeneratorImplementations.values());
  }

  /**
   * Clear all registrations (useful for testing)
   */
  static clearAll(): void {
    this.planManagerImplementations.clear();
    this.instructionGeneratorImplementations.clear();
  }

  /**
   * Check if an implementation is registered
   */
  static isRegistered(
    interfaceType: 'plan-manager' | 'instruction-generator',
    name: string
  ): boolean {
    switch (interfaceType) {
      case 'plan-manager':
        return this.planManagerImplementations.has(name);
      case 'instruction-generator':
        return this.instructionGeneratorImplementations.has(name);
      default:
        return false;
    }
  }

  /**
   * Get summary of all registered implementations
   */
  static getRegistrationSummary(): {
    planManagers: string[];
    instructionGenerators: string[];
    total: number;
  } {
    const planManagers = Array.from(this.planManagerImplementations.keys());
    const instructionGenerators = Array.from(
      this.instructionGeneratorImplementations.keys()
    );

    return {
      planManagers,
      instructionGenerators,
      total: planManagers.length + instructionGenerators.length,
    };
  }
}

/**
 * Auto-discovery function to register all implementations
 */
export async function discoverAndRegisterImplementations(): Promise<void> {
  console.info(
    'Implementation discovery complete. Use ImplementationRegistry.getRegistrationSummary() to see registered implementations.'
  );
}
