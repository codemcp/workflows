# Interface Contract Test Framework

This directory contains a comprehensive test framework for ensuring interface compliance across all implementations in the @codemcp/workflows strategy pattern.

## Overview

The framework provides automated testing to ensure that all implementations of the core interfaces (`IPlanManager`, `IInstructionGenerator`, `ITaskBackendClient`) satisfy their contract requirements consistently.

## Architecture

### Core Components

1. **Base Framework** (`base-interface-contract.ts`)
   - `BaseInterfaceContract<T>` - Abstract base class for all contract tests
   - `MethodTestConfig` - Configuration for testing method signatures and return types
   - `ErrorTestConfig` - Configuration for testing error handling behavior
   - `ImplementationRegistration<T>` - Registration interface for implementations
   - `ValidationHelpers` - Common validation utilities

2. **Implementation Registry** (`implementation-registry.ts`)
   - `ImplementationRegistry` - Central registry for all implementations
   - `RegisterImplementation` - Decorator for auto-registration
   - `discoverAndRegisterImplementations()` - Auto-discovery function

3. **Interface-Specific Contract Tests**
   - `plan-manager-contract.test.ts` - Tests for `IPlanManager` implementations
   - `instruction-generator-contract.test.ts` - Tests for `IInstructionGenerator` implementations
   - `task-backend-client-contract.test.ts` - Tests for `ITaskBackendClient` implementations

4. **Implementation Tests** (`existing-implementations.test.ts`)
   - Registration and testing of existing implementations
   - Setup/cleanup for file-based tests
   - Integration with contract test suites

## Usage

### Running the Contract Tests

```bash
# Run all contract tests
npm test -- packages/core/test/unit/contracts/

# Run specific interface contract tests
npm test -- packages/core/test/unit/contracts/plan-manager-contract.test.ts
npm test -- packages/core/test/unit/contracts/instruction-generator-contract.test.ts
npm test -- packages/core/test/unit/contracts/task-backend-client-contract.test.ts

# Run implementation registration tests
npm test -- packages/core/test/unit/contracts/existing-implementations.test.ts
```

### Adding New Implementations to Tests

#### Method 1: Manual Registration

```typescript
import { ImplementationRegistry } from './implementation-registry.js';
import { YourNewImplementation } from '../../src/your-new-implementation.js';

// Register your implementation
ImplementationRegistry.registerPlanManager({
  name: 'YourNewImplementation',
  description: 'Description of what your implementation does',
  createInstance: () => new YourNewImplementation(),
  setup: async instance => {
    // Optional setup logic
  },
  cleanup: async instance => {
    // Optional cleanup logic
  },
  skipTests: ['methodName'], // Optional: skip specific tests
});
```

#### Method 2: Using the Decorator

```typescript
import { RegisterImplementation } from './contracts/implementation-registry.js';

@RegisterImplementation('plan-manager', {
  name: 'YourNewImplementation',
  description: 'Description of what your implementation does',
})
export class YourNewImplementation implements IPlanManager {
  // Implementation...
}
```

### Creating Tests for New Interfaces

1. **Extend the Base Contract Class**

```typescript
import { BaseInterfaceContract } from './base-interface-contract.js';

class YourInterfaceContract extends BaseInterfaceContract<IYourInterface> {
  protected interfaceName = 'IYourInterface';

  protected getRequiredMethods(): string[] {
    return ['method1', 'method2', 'method3'];
  }

  protected getMethodTests(): MethodTestConfig[] {
    return [
      {
        methodName: 'method1',
        parameters: ['param1', 'param2'],
        isAsync: true,
        returnTypeValidator: ValidationHelpers.isNonEmptyString,
        description: 'should handle basic operations',
      },
      // ... more method tests
    ];
  }

  protected getErrorTests(): ErrorTestConfig[] {
    return [
      {
        methodName: 'method1',
        invalidParameters: ['', null],
        expectedError: /validation error pattern/i,
        description: 'should reject invalid parameters',
      },
      // ... more error tests
    ];
  }

  protected testImplementationBehavior(
    registration: ImplementationRegistration<IYourInterface>
  ): void {
    describe('Custom Behavior Tests', () => {
      it('should handle specific implementation requirements', async () => {
        const instance = await registration.createInstance();
        // ... test implementation-specific behavior
      });
    });
  }
}
```

2. **Create the Test File**

```typescript
// your-interface-contract.test.ts
import { describe, beforeEach } from 'vitest';
import { ImplementationRegistry } from './implementation-registry.js';

describe('IYourInterface Contract Tests', () => {
  const contract = new YourInterfaceContract();

  beforeEach(() => {
    const implementations = ImplementationRegistry.getYourInterfaceImplementations();
    for (const impl of implementations) {
      contract.registerImplementation(impl);
    }
  });

  contract.createContractTests();
});
```

## Test Categories

### 1. Interface Compliance Tests

Verify that implementations:

- Have all required methods
- Method signatures match interface definitions
- Return types are correct
- Error handling is consistent

### 2. Implementation-Specific Behavior Tests

Test behavior that's specific to each implementation:

- State management
- File operations
- Backend integration
- Configuration handling

### 3. Error Handling Tests

Ensure implementations handle errors consistently:

- Invalid parameters
- Missing dependencies
- Network/filesystem errors
- Edge cases

### 4. Integration Tests

Test that implementations work correctly with:

- Other interface implementations
- Mock data
- File systems
- External dependencies

## Validation Helpers

The framework provides common validation utilities:

```typescript
import { ValidationHelpers } from './base-interface-contract.js';

// Basic type validators
ValidationHelpers.isNonEmptyString(value);
ValidationHelpers.isBoolean(value);
ValidationHelpers.isArray(value);
ValidationHelpers.isPromise(value);

// Structure validators
ValidationHelpers.hasProperties(['prop1', 'prop2'])(value);
ValidationHelpers.matchesStructure<Type>(validator)(value);
```

## Best Practices

### 1. Implementation Registration

- Provide clear, descriptive names and descriptions
- Include setup/cleanup functions for file/resource management
- Use `skipTests` sparingly and only for valid technical reasons
- Document why certain tests are skipped

### 2. Writing Contract Tests

- Test the interface contract, not implementation details
- Use meaningful test descriptions
- Provide comprehensive error test scenarios
- Include edge cases and boundary conditions

### 3. Test Data

- Use realistic but minimal test data
- Create reusable mock objects
- Clean up test artifacts in cleanup functions
- Use temporary directories for file operations

### 4. Error Testing

- Test with invalid parameters
- Verify error messages are meaningful
- Ensure consistent error types across implementations
- Test error recovery scenarios

## Common Issues and Solutions

### 1. TypeScript Compilation Errors

- Ensure all interface imports are correct
- Check that generic types are properly specified
- Verify async/await usage matches method signatures

### 2. Test Isolation

- Use beforeEach/afterEach for setup/cleanup
- Avoid shared state between tests
- Use unique test data per test case

### 3. Mock Dependencies

- Create minimal mocks for required dependencies
- Use dependency injection where possible
- Avoid tight coupling to specific implementations

### 4. File System Tests

- Use temporary directories
- Clean up test files after each test
- Handle permission and path issues gracefully

## Framework Extension

### Adding New Interface Types

1. Add to `ImplementationRegistry` with new methods
2. Create contract test class extending `BaseInterfaceContract`
3. Add registration methods and storage
4. Update auto-discovery if needed

### Custom Validation

Create custom validators for complex types:

```typescript
const customValidator = (value: unknown): value is CustomType => {
  return (
    ValidationHelpers.hasProperties(['required', 'props'])(value) &&
    // additional custom validation
    typeof (value as CustomType).required === 'string'
  );
};
```

### Performance Considerations

- Use lazy loading for heavy dependencies
- Cache expensive setup operations
- Consider parallel test execution for independent tests
- Monitor test execution times and optimize slow tests

## Integration with CI/CD

The contract tests are designed to run in CI/CD pipelines:

- No external dependencies required
- Deterministic test behavior
- Clear pass/fail reporting
- Minimal resource usage

### GitHub Actions Integration

```yaml
- name: Run Interface Contract Tests
  run: npm test -- packages/core/test/unit/contracts/ --reporter=json
```

## Future Enhancements

Potential improvements to the framework:

1. **Automatic Mock Generation** - Generate mocks from interface definitions
2. **Performance Testing** - Add benchmarks for implementation comparison
3. **Coverage Analysis** - Track which interface methods are tested
4. **Visual Reports** - Generate HTML reports of contract compliance
5. **Property-Based Testing** - Add QuickCheck-style testing for edge cases

## Contributing

When adding new implementations or modifying the framework:

1. Ensure all existing tests continue to pass
2. Add comprehensive tests for new functionality
3. Update documentation for any changes
4. Follow the established patterns and conventions
5. Test with multiple implementations to verify consistency
