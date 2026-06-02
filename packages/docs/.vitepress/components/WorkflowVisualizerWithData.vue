<template>
  <WorkflowVisualizer
    v-if="workflows.length > 0"
    :workflows="workflows"
    :show-sidebar="showSidebar"
    :hide-header="hideHeader"
    :initial-workflow="initialWorkflow"
  />
  <div v-else class="loading-message">Loading workflows...</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import WorkflowVisualizer, {
  type WorkflowDefinition,
} from '@codemcp/workflows-visualizer';
import { AVAILABLE_WORKFLOWS } from '../workflow-manifest.js';

interface Props {
  showSidebar?: boolean;
  hideHeader?: boolean;
  initialWorkflow?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showSidebar: true,
  hideHeader: false,
  initialWorkflow: '',
});

// Load workflows directly from manifest
const workflows = ref<WorkflowDefinition[]>(
  AVAILABLE_WORKFLOWS.map(workflowName => ({
    name: workflowName,
    displayName:
      workflowName.charAt(0).toUpperCase() +
      workflowName.slice(1).replace(/-/g, ' '),
    path: `/workflows/workflows/${workflowName}.yaml`,
  }))
);

onMounted(() => {
  console.log('WorkflowVisualizerWithData mounted');
  console.log('AVAILABLE_WORKFLOWS:', AVAILABLE_WORKFLOWS);
  console.log('workflows.value:', workflows.value);
  console.log('workflows.value length:', workflows.value.length);
  console.log('First workflow:', workflows.value[0]);

  // Make workflows available globally for debugging
  (
    window as unknown as { debugWorkflows: WorkflowDefinition[] }
  ).debugWorkflows = workflows.value;
});
</script>

<style scoped>
.loading-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: #64748b;
  font-style: italic;
}
</style>
