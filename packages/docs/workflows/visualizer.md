---
sidebar: false
aside: false
title: Workflow Visualizer
---

# Workflow Visualizer

Select a workflow from the dropdown to explore its states and transitions interactively, or upload your own YAML file.

- Click on any **state** in the diagram to see its description and default instructions
- Click on any **transition arrow** to see trigger conditions and instructions
- Use the **Upload YAML** button to visualize a custom workflow file

<style>
.vp-doc,
.VPDoc .container,
.content,
.content-container,
.VPContent,
.VPDoc {
  max-width: none !important;
  width: 100% !important;
}

.vp-doc {
  padding: 0 24px !important;
}

.vp-doc h2 {
  border-top: none;
}
</style>

<WorkflowVisualizer :showSidebar="true" />
