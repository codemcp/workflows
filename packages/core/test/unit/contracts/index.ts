/**
 * Interface Contract Test Framework
 *
 * Central export point for the contract testing framework.
 */

// Core framework components
export {
  BaseInterfaceContract,
  ValidationHelpers,
  type MethodTestConfig,
  type ErrorTestConfig,
  type ImplementationRegistration,
} from './base-interface-contract.js';

// Implementation registry
export {
  ImplementationRegistry,
  discoverAndRegisterImplementations,
} from './implementation-registry.js';

/**
 * Quick setup function to register all existing implementations
 */
export async function setupContractTesting(): Promise<void> {
  const { discoverAndRegisterImplementations: discover } =
    await import('./implementation-registry.js');
  await discover();

  const { ImplementationRegistry: registry } =
    await import('./implementation-registry.js');
  const summary = registry.getRegistrationSummary();
  console.info('Contract test setup complete:', summary);
}

/**
 * Utility function to check if all required implementations are registered
 */
export function validateRegistrations(): {
  isComplete: boolean;
  missing: string[];
  registered: string[];
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImplementationRegistry } = require('./implementation-registry.js');
  const summary = ImplementationRegistry.getRegistrationSummary();

  const requiredImplementations = {
    planManager: ['PlanManager'],
    instructionGenerator: ['InstructionGenerator'],
  };

  const missing: string[] = [];
  const registered: string[] = [];

  for (const required of requiredImplementations.planManager) {
    if (summary.planManagers.includes(required)) {
      registered.push(`IPlanManager:${required}`);
    } else {
      missing.push(`IPlanManager:${required}`);
    }
  }

  for (const required of requiredImplementations.instructionGenerator) {
    if (summary.instructionGenerators.includes(required)) {
      registered.push(`IInstructionGenerator:${required}`);
    } else {
      missing.push(`IInstructionGenerator:${required}`);
    }
  }

  return {
    isComplete: missing.length === 0,
    missing,
    registered,
  };
}

/**
 * Get contract testing metrics
 */
export function getContractMetrics(): {
  totalImplementations: number;
  interfacesCovered: number;
  implementationsByInterface: Record<string, number>;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImplementationRegistry } = require('./implementation-registry.js');
  const summary = ImplementationRegistry.getRegistrationSummary();

  return {
    totalImplementations: summary.total,
    interfacesCovered: 2, // IPlanManager, IInstructionGenerator
    implementationsByInterface: {
      IPlanManager: summary.planManagers.length,
      IInstructionGenerator: summary.instructionGenerators.length,
    },
  };
}
