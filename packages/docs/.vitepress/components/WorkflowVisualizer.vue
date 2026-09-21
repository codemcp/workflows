<template>
  <div id="workflow-visualizer-app" :class="{ fullscreen: !showSidebar }">
    <header class="app-header" v-if="!hideHeader">
      <h1>Workflow Visualizer</h1>
      <div class="workflow-controls">
        <select
          id="workflow-selector"
          class="workflow-selector"
          v-model="selectedWorkflow"
          @change="onWorkflowSelect"
        >
          <option value="">Select a workflow...</option>
          <option v-for="wf in workflows" :key="wf.name" :value="wf.name">
            {{ wf.displayName || wf.name
            }}{{ wf.domain ? ` [${wf.domain}]` : '' }}
          </option>
        </select>
        <input
          type="file"
          id="file-upload"
          ref="fileInputRef"
          accept=".yaml,.yml"
          class="file-upload"
          @change="onFileUpload"
        />
        <label for="file-upload" class="file-upload-label">Upload YAML</label>
      </div>
    </header>

    <main class="app-main" :class="{ 'no-sidebar': !showSidebar }">
      <div class="diagram-container">
        <div ref="diagramCanvasRef" class="diagram-canvas">
          <div class="loading-message">
            {{
              currentWorkflow
                ? ''
                : initialWorkflow
                  ? 'Loading workflow...'
                  : 'Select a workflow to visualize'
            }}
          </div>
        </div>
      </div>

      <aside v-if="showSidebar" class="side-panel">
        <div class="side-panel-header" ref="sidePanelHeaderRef">
          <h2>Details</h2>
        </div>
        <div class="side-panel-content" ref="sidePanelContentRef">
          <div class="empty-state">
            Click on a state or transition to see details
          </div>
        </div>
      </aside>
    </main>

    <div v-if="errorMessage" class="error-container">
      <div class="error-message">
        <span class="error-text">{{ errorMessage }}</span>
        <button class="error-close" @click="errorMessage = ''">&times;</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { load as parseYaml } from 'js-yaml';

// ── Types ──────────────────────────────────────────────────────────────────

interface WorkflowDefinition {
  name: string;
  displayName?: string;
  domain?: string;
  path?: string;
}

interface YamlTransition {
  trigger: string;
  to: string;
  transition_reason?: string;
  instructions?: string;
  additional_instructions?: string;
  review_perspectives?: Array<{ perspective: string; prompt: string }>;
}

interface YamlState {
  description: string;
  default_instructions: string;
  transitions: YamlTransition[];
}

interface YamlStateMachine {
  name: string;
  description?: string;
  initial_state: string;
  states: Record<string, YamlState>;
  metadata?: Record<string, unknown>;
}

interface SelectedElement {
  type: 'state' | 'transition';
  id: string;
  data: YamlState | TransitionData;
}

interface TransitionData {
  trigger: string;
  from: string;
  to: string;
  instructions?: string;
  additional_instructions?: string;
  transition_reason?: string;
  review_perspectives?: Array<{ perspective: string; prompt: string }>;
}

// ── Props ──────────────────────────────────────────────────────────────────

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

// ── State ──────────────────────────────────────────────────────────────────

const workflows = ref<WorkflowDefinition[]>([]);
const selectedWorkflow = ref('');
const currentWorkflow = ref<YamlStateMachine | null>(null);
const selectedElement = ref<SelectedElement | null>(null);
const parentState = ref<{ id: string; data: YamlState } | null>(null);
const errorMessage = ref('');

const diagramCanvasRef = ref<HTMLElement | null>(null);
const sidePanelHeaderRef = ref<HTMLElement | null>(null);
const sidePanelContentRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// ── PlantUML Encoder (inlined) ─────────────────────────────────────────────

async function encodePlantUML(code: string): Promise<string> {
  try {
    const utf8Bytes = new TextEncoder().encode(code);
    if ('CompressionStream' in window) {
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      writer.write(utf8Bytes);
      writer.close();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) chunks.push(value);
      }
      const totalLen = chunks.reduce((a, c) => a + c.length, 0);
      const compressed = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }
      return encode64(compressed);
    }
    return encodeFallback(code);
  } catch {
    return encodeFallback(code);
  }
}

function encode64(data: Uint8Array): string {
  let r = '';
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) r += append3bytes(data[i], data[i + 1], 0);
    else if (i + 1 === data.length) r += append3bytes(data[i], 0, 0);
    else r += append3bytes(data[i], data[i + 1], data[i + 2]);
  }
  return r;
}

function append3bytes(b1: number, b2: number, b3: number): string {
  return (
    encode6bit(b1 >> 2) +
    encode6bit(((b1 & 3) << 4) | (b2 >> 4)) +
    encode6bit(((b2 & 15) << 2) | (b3 >> 6)) +
    encode6bit(b3 & 63)
  );
}

function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  return b === 0 ? '-' : b === 1 ? '_' : '?';
}

function encodeFallback(code: string): string {
  const utf8 = unescape(encodeURIComponent(code));
  return '~1' + btoa(utf8);
}

// ── PlantUML Generator ─────────────────────────────────────────────────────

function generatePlantUML(workflow: YamlStateMachine): string {
  const lines: string[] = [
    '@startuml',
    '!theme plain',
    'skinparam backgroundColor white',
    'skinparam state {',
    '  BackgroundColor white',
    '  BorderColor #2563eb',
    '  FontColor #1e293b',
    '  FontSize 12',
    '}',
    'skinparam arrow {',
    '  Color #94a3b8',
    '  FontColor #64748b',
    '  FontSize 10',
    '}',
    '',
    `[*] --> ${workflow.initial_state}`,
    '',
  ];

  for (const [stateName, stateConfig] of Object.entries(workflow.states)) {
    if (stateConfig.description) {
      lines.push(`${stateName} : ${stateConfig.description}`);
    }
  }
  lines.push('');

  for (const [stateName, stateConfig] of Object.entries(workflow.states)) {
    for (const t of stateConfig.transitions ?? []) {
      const label = t.trigger.replace(/_/g, ' ');
      const reviewIcon = t.review_perspectives?.length ? ' 🛡️' : '';
      lines.push(`${stateName} --> ${t.to} : ${label}${reviewIcon}`);
    }
  }

  const finalStates = Object.entries(workflow.states)
    .filter(([, s]) => !s.transitions?.length)
    .map(([n]) => n);
  if (finalStates.length) {
    lines.push('');
    for (const s of finalStates) lines.push(`${s} --> [*]`);
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}

// ── Render ─────────────────────────────────────────────────────────────────

async function renderWorkflow(workflow: YamlStateMachine): Promise<void> {
  const canvas = diagramCanvasRef.value;
  if (!canvas) return;

  canvas.innerHTML = '';
  canvas.style.overflow = 'auto';

  const plantUMLCode = generatePlantUML(workflow);

  let diagramUrl: string;
  try {
    const encoded = await encodePlantUML(plantUMLCode);
    diagramUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;
  } catch {
    diagramUrl = `https://www.plantuml.com/plantuml/svg/~1${encodeURIComponent(plantUMLCode)}`;
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;padding:20px;text-align:center';

  // Title
  const titleDiv = document.createElement('div');
  titleDiv.style.cssText =
    'display:flex;align-items:flex-start;justify-content:center;gap:8px;margin-bottom:4px';

  const h2 = document.createElement('h2');
  h2.textContent = `${workflow.name} workflow`;
  h2.style.cssText =
    'color:#1e293b;margin:0;font-size:1.5rem;cursor:pointer;padding:8px 12px;border-radius:6px;transition:background-color 0.2s ease';
  h2.title = 'Click to show workflow information';
  h2.addEventListener('click', () => {
    selectedElement.value = null;
    parentState.value = null;
    updateSidePanel();
  });
  h2.addEventListener('mouseenter', () => {
    h2.style.backgroundColor = '#f8fafc';
  });
  h2.addEventListener('mouseleave', () => {
    h2.style.backgroundColor = 'transparent';
  });
  titleDiv.appendChild(h2);

  const domain = (workflow.metadata as Record<string, unknown> | undefined)
    ?.domain as string | undefined;
  if (domain) {
    const pill = document.createElement('span');
    pill.textContent = domain;
    pill.style.cssText =
      'display:inline-block;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;border:1px solid #93c5fd;text-transform:uppercase;letter-spacing:0.5px;margin-top:6px';
    titleDiv.appendChild(pill);
  }
  wrapper.appendChild(titleDiv);

  if (workflow.description) {
    const desc = document.createElement('p');
    desc.textContent = workflow.description;
    desc.style.cssText = 'color:#64748b;margin-bottom:20px;text-align:center';
    wrapper.appendChild(desc);
  }

  // SVG container
  const svgWrapper = document.createElement('div');
  svgWrapper.style.cssText = 'position:relative;display:inline-block';
  wrapper.appendChild(svgWrapper);
  canvas.appendChild(wrapper);

  // Fetch and embed interactive SVG
  try {
    const resp = await fetch(diagramUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const svgText = await resp.text();
    const svgContainer = document.createElement('div');
    svgContainer.innerHTML = svgText;
    svgContainer.style.cssText =
      'border:1px solid #e2e8f0;border-radius:8px;background:white;overflow:hidden';
    const svgEl = svgContainer.querySelector('svg');
    if (svgEl) {
      svgEl.style.cssText = 'max-width:100%;height:auto;display:block';
      makeSVGInteractive(svgEl, workflow);
    }
    svgWrapper.appendChild(svgContainer);
  } catch (err) {
    console.error('Failed to load PlantUML SVG:', err);
    const fallback = document.createElement('div');
    fallback.style.cssText =
      'padding:20px;border:2px dashed #94a3b8;border-radius:8px;background:#f8fafc;text-align:center;color:#64748b';
    fallback.textContent =
      'Failed to load diagram. Check your network connection.';
    svgWrapper.appendChild(fallback);
  }
}

function makeSVGInteractive(
  svgEl: SVGSVGElement,
  workflow: YamlStateMachine
): void {
  const stateNames = Object.keys(workflow.states);

  // Make states clickable
  const textEls = svgEl.querySelectorAll('text');
  for (const textEl of textEls) {
    const text = textEl.textContent?.trim();
    if (text && stateNames.includes(text)) {
      const group = textEl.closest('g');
      if (!group) continue;
      const stateName = text;
      (group as unknown as HTMLElement).style.cursor = 'pointer';
      const shape = group.querySelector('rect, ellipse, polygon');
      const origFill = shape?.getAttribute('fill') ?? '#ffffff';
      const origStroke = shape?.getAttribute('stroke') ?? '#000000';
      group.addEventListener('mouseenter', () => {
        shape?.setAttribute('fill', '#e0f2fe');
        shape?.setAttribute('stroke', '#2563eb');
        shape?.setAttribute('stroke-width', '2');
      });
      group.addEventListener('mouseleave', () => {
        shape?.setAttribute('fill', origFill);
        shape?.setAttribute('stroke', origStroke);
        shape?.setAttribute('stroke-width', '1');
      });
      group.addEventListener('click', e => {
        e.stopPropagation();
        selectState(stateName, workflow.states[stateName]);
      });
    }
  }

  // Make transitions clickable
  const linkGroups = svgEl.querySelectorAll('g.link[id^="lnk"]');
  for (const linkGroup of linkGroups) {
    (linkGroup as unknown as HTMLElement).style.cursor = 'pointer';
    const pathEl = linkGroup.querySelector('path');
    const textEl = linkGroup.querySelector('text');
    const origStroke = pathEl?.getAttribute('stroke') ?? '#94A3B8';
    const origTextFill = textEl?.getAttribute('fill') ?? '#64748B';

    linkGroup.addEventListener('mouseenter', () => {
      pathEl?.setAttribute('stroke', '#2563eb');
      pathEl?.setAttribute('stroke-width', '3');
      textEl?.setAttribute('fill', '#2563eb');
    });
    linkGroup.addEventListener('mouseleave', () => {
      pathEl?.setAttribute('stroke', origStroke);
      pathEl?.setAttribute('stroke-width', '1');
      textEl?.setAttribute('fill', origTextFill);
    });
    linkGroup.addEventListener('click', e => {
      e.stopPropagation();
      const labelText = textEl?.textContent?.trim();
      if (!labelText) return;
      const cleanLabel = labelText.replace(/[^\w\s]/g, '').trim();
      for (const [stateName, stateData] of Object.entries(workflow.states)) {
        for (const t of stateData.transitions ?? []) {
          const cleanTrigger = t.trigger.replace(/_/g, ' ');
          if (
            cleanTrigger.toLowerCase().includes(cleanLabel.toLowerCase()) ||
            cleanLabel.toLowerCase().includes(cleanTrigger.toLowerCase())
          ) {
            selectTransition(`${stateName}->${t.to}`, {
              from: stateName,
              to: t.to,
              trigger: t.trigger,
              instructions: t.instructions,
              additional_instructions: t.additional_instructions,
              transition_reason: t.transition_reason,
              review_perspectives: t.review_perspectives ?? [],
            });
            return;
          }
        }
      }
    });
  }
}

// ── Side Panel ─────────────────────────────────────────────────────────────

function updateSidePanel(): void {
  const header = sidePanelHeaderRef.value;
  const content = sidePanelContentRef.value;
  if (!header || !content) return;

  if (!currentWorkflow.value) {
    header.innerHTML = '<h2>Details</h2>';
    content.innerHTML =
      '<div class="empty-state">Select a workflow to see details</div>';
    return;
  }

  if (selectedElement.value) {
    const el = selectedElement.value;
    if (el.type === 'state') {
      renderStatePanel(el.id, el.data as YamlState, header, content);
    } else {
      renderTransitionPanel(el.data as TransitionData, header, content);
    }
  } else {
    renderMetadataPanel(currentWorkflow.value, header, content);
  }
}

function renderMetadataPanel(
  workflow: YamlStateMachine,
  header: HTMLElement,
  content: HTMLElement
): void {
  header.innerHTML = '<h2>Workflow Info</h2>';
  const meta = workflow.metadata ?? {};
  const metaEntries = Object.entries(meta);

  content.innerHTML = `
    <div class="detail-section">
      <h3 class="detail-title">${workflow.name}</h3>
      <p class="detail-content">${workflow.description ?? ''}</p>
    </div>
    ${
      metaEntries.length
        ? `
    <div class="detail-section">
      ${metaEntries
        .map(
          ([k, v]) => `
        <div class="metadata-item">
          <strong>${k.replace(/_/g, ' ').toUpperCase()}:</strong>
          ${Array.isArray(v) ? `<ul>${v.map((i: unknown) => `<li>${i}</li>`).join('')}</ul>` : `<span>${v}</span>`}
        </div>
      `
        )
        .join('')}
    </div>`
        : ''
    }
    <div class="detail-section">
      <p class="detail-hint">Click on states or transitions to see detailed information.</p>
    </div>
  `;
}

function renderStatePanel(
  stateId: string,
  stateData: YamlState,
  header: HTMLElement,
  content: HTMLElement
): void {
  const isInitial = stateId === currentWorkflow.value?.initial_state;
  header.innerHTML = `
    <button class="back-button" title="Back to Overview">←</button>
    <h2>State: ${stateId}</h2>
  `;
  header.querySelector('.back-button')?.addEventListener('click', () => {
    selectedElement.value = null;
    parentState.value = null;
    updateSidePanel();
  });

  content.innerHTML = `
    <div class="detail-section">
      <h3 class="detail-title">
        ${stateId}
        ${isInitial ? '<span class="badge badge-success">Initial</span>' : ''}
      </h3>
      <p class="detail-content">${stateData.description}</p>
    </div>
    <div class="detail-section">
      <h4 class="detail-subtitle">Default Instructions</h4>
      <div class="code-block">${stateData.default_instructions}</div>
    </div>
    <div class="detail-section">
      <h4 class="detail-subtitle">Transitions (${stateData.transitions?.length ?? 0})</h4>
      <ul class="transitions-list">
        ${(stateData.transitions ?? [])
          .map(
            t => `
          <li class="transition-item clickable-transition"
              data-from="${stateId}" data-to="${t.to}" data-trigger="${t.trigger}">
            <div class="transition-trigger">${t.trigger}</div>
            <div class="transition-target">→ ${t.to}</div>
            <div class="transition-reason">${t.transition_reason ?? ''}</div>
          </li>
        `
          )
          .join('')}
      </ul>
    </div>
  `;

  for (const item of content.querySelectorAll('.clickable-transition')) {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const from = item.getAttribute('data-from') ?? '';
      const to = item.getAttribute('data-to') ?? '';
      const trigger = item.getAttribute('data-trigger') ?? '';
      const fullT = stateData.transitions.find(
        t => t.to === to && t.trigger === trigger
      );
      if (fullT) {
        parentState.value = { id: stateId, data: stateData };
        selectTransition(`${from}->${to}`, {
          from,
          to,
          trigger,
          instructions: fullT.instructions,
          additional_instructions: fullT.additional_instructions,
          transition_reason: fullT.transition_reason,
          review_perspectives: fullT.review_perspectives ?? [],
        });
      }
    });
  }
}

function renderTransitionPanel(
  t: TransitionData,
  header: HTMLElement,
  content: HTMLElement
): void {
  header.innerHTML = `
    <button class="back-button" title="Back">←</button>
    <h2>Transition: ${t.trigger}</h2>
  `;
  header.querySelector('.back-button')?.addEventListener('click', () => {
    if (parentState.value) {
      selectedElement.value = {
        type: 'state',
        id: parentState.value.id,
        data: parentState.value.data,
      };
      parentState.value = null;
    } else {
      selectedElement.value = null;
    }
    updateSidePanel();
  });

  content.innerHTML = `
    <div class="detail-section">
      <h3 class="detail-title">Transition: ${t.trigger}</h3>
      <p class="detail-content"><strong>${t.from}</strong> → <strong>${t.to}</strong></p>
    </div>
    <div class="detail-section">
      <h4 class="detail-subtitle">Reason</h4>
      <p class="detail-content">${t.transition_reason ?? ''}</p>
    </div>
    ${
      t.instructions
        ? `
    <div class="detail-section">
      <h4 class="detail-subtitle">Instructions</h4>
      <div class="code-block">${t.instructions}</div>
    </div>`
        : ''
    }
    ${
      t.additional_instructions
        ? `
    <div class="detail-section">
      <h4 class="detail-subtitle">Additional Instructions</h4>
      <div class="code-block">${t.additional_instructions}</div>
    </div>`
        : ''
    }
    ${
      t.review_perspectives?.length
        ? `
    <div class="detail-section">
      <h4 class="detail-subtitle">Review Perspectives (${t.review_perspectives.length})</h4>
      ${t.review_perspectives
        .map(
          r => `
        <div class="review-perspective">
          <h5 class="review-role">${r.perspective.replace(/_/g, ' ').toUpperCase()}</h5>
          <p class="review-prompt">${r.prompt}</p>
        </div>
      `
        )
        .join('')}
    </div>`
        : ''
    }
  `;
}

// ── Selectors ──────────────────────────────────────────────────────────────

function selectState(stateId: string, stateData: YamlState): void {
  selectedElement.value = { type: 'state', id: stateId, data: stateData };
  updateSidePanel();
}

function selectTransition(id: string, data: TransitionData): void {
  selectedElement.value = { type: 'transition', id, data };
  updateSidePanel();
}

// ── Workflow loading ───────────────────────────────────────────────────────

async function loadWorkflow(name: string): Promise<void> {
  const canvas = diagramCanvasRef.value;
  if (canvas)
    canvas.innerHTML = '<div class="loading-message">Loading workflow...</div>';

  try {
    const path = `/workflows/workflows/${name}.yaml`;
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const yaml = await resp.text();
    const parsed = parseYaml(yaml) as YamlStateMachine;
    currentWorkflow.value = parsed;
    selectedElement.value = null;
    parentState.value = null;
    await renderWorkflow(parsed);
    updateSidePanel();
  } catch (err) {
    console.error('Failed to load workflow:', err);
    if (canvas)
      canvas.innerHTML =
        '<div class="loading-message">Failed to load workflow</div>';
    errorMessage.value = `Failed to load workflow "${name}"`;
  }
}

async function onWorkflowSelect(): Promise<void> {
  if (!selectedWorkflow.value) {
    currentWorkflow.value = null;
    selectedElement.value = null;
    const canvas = diagramCanvasRef.value;
    if (canvas)
      canvas.innerHTML =
        '<div class="loading-message">Select a workflow to visualize</div>';
    updateSidePanel();
    return;
  }
  await loadWorkflow(selectedWorkflow.value);
}

async function onFileUpload(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    const validExt = ['.yaml', '.yml'];
    if (!validExt.some(e => file.name.toLowerCase().endsWith(e))) {
      throw new Error('Invalid file type. Please select a .yaml or .yml file.');
    }
    if (file.size > 1024 * 1024) throw new Error('File too large (max 1MB).');
    if (file.size === 0) throw new Error('File is empty.');

    const text = await file.text();
    if (!text.trim()) throw new Error('File is empty.');

    const parsed = parseYaml(text) as YamlStateMachine;
    currentWorkflow.value = parsed;
    selectedElement.value = null;
    parentState.value = null;
    selectedWorkflow.value = '';
    await renderWorkflow(parsed);
    updateSidePanel();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errorMessage.value = `Upload failed: ${msg}`;
    console.error(err);
  } finally {
    target.value = '';
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function loadManifest(): Promise<void> {
  try {
    // Dynamic import of the generated manifest
    const mod = await import(/* @vite-ignore */ '../workflow-manifest.js');
    const names: string[] = mod.AVAILABLE_WORKFLOWS ?? [];
    workflows.value = names.map(name => ({
      name,
      displayName:
        name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '),
    }));
  } catch (err) {
    console.warn('Could not load workflow manifest:', err);
    workflows.value = [];
  }
}

onMounted(async () => {
  await loadManifest();

  if (props.initialWorkflow) {
    selectedWorkflow.value = props.initialWorkflow;
    await loadWorkflow(props.initialWorkflow);
  }
});

onUnmounted(() => {
  currentWorkflow.value = null;
});
</script>

<style>
/* ── CSS Variables ──────────────────────────────────────────────── */
#workflow-visualizer-app {
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-success: #059669;
  --color-error: #dc2626;
  --color-white: #ffffff;
  --color-gray-50: #f8fafc;
  --color-gray-100: #f1f5f9;
  --color-gray-200: #e2e8f0;
  --color-gray-300: #cbd5e1;
  --color-gray-400: #94a3b8;
  --color-gray-500: #64748b;
  --color-gray-600: #475569;
  --color-gray-700: #334155;
  --color-gray-800: #1e293b;
  --color-gray-900: #0f172a;
  --font-sans:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
  --font-mono:
    'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New',
    monospace;
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg:
    0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

#workflow-visualizer-app {
  width: 100%;
  height: 100%;
  background: var(--color-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-gray-900);
}

#workflow-visualizer-app * {
  box-sizing: border-box;
}

/* Header */
#workflow-visualizer-app .app-header {
  background: var(--color-gray-50);
  border-bottom: 1px solid var(--color-gray-200);
  padding: var(--spacing-lg);
}

#workflow-visualizer-app .app-header h1 {
  margin: 0 0 var(--spacing-md);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-gray-900);
}

#workflow-visualizer-app .workflow-controls {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  flex-wrap: wrap;
}

#workflow-visualizer-app .workflow-selector {
  flex: 1;
  min-width: 200px;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: var(--color-white);
  font-family: inherit;
  font-size: inherit;
  color: var(--color-gray-900);
  cursor: pointer;
}

#workflow-visualizer-app .file-upload {
  display: none;
}

#workflow-visualizer-app .file-upload-label {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
  user-select: none;
}

#workflow-visualizer-app .file-upload-label:hover {
  background: var(--color-primary-hover);
}

/* Main layout */
#workflow-visualizer-app .app-main {
  display: flex;
  height: calc(100% - 100px);
  min-height: 500px;
}

#workflow-visualizer-app.fullscreen .app-main {
  height: 80vh;
  min-height: 500px;
}

#workflow-visualizer-app .diagram-container {
  flex: 1;
  overflow: hidden;
  background: var(--color-white);
}

#workflow-visualizer-app .diagram-canvas {
  width: 100%;
  height: 100%;
  overflow: auto;
}

#workflow-visualizer-app .loading-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: var(--color-gray-500);
  font-style: italic;
}

/* Side panel */
#workflow-visualizer-app .side-panel {
  width: 35%;
  min-width: 280px;
  border-left: 1px solid var(--color-gray-200);
  background: var(--color-gray-50);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#workflow-visualizer-app .side-panel-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-gray-200);
  background: var(--color-white);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

#workflow-visualizer-app .side-panel-header h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-gray-900);
}

#workflow-visualizer-app .side-panel-content {
  flex: 1;
  padding: var(--spacing-lg);
  overflow-y: auto;
}

#workflow-visualizer-app .empty-state {
  color: var(--color-gray-500);
  text-align: center;
  font-style: italic;
  padding: var(--spacing-xl) 0;
}

/* Detail sections */
#workflow-visualizer-app .detail-section {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--color-gray-200);
}

#workflow-visualizer-app .detail-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

#workflow-visualizer-app .detail-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-gray-900);
  margin-bottom: var(--spacing-sm);
}

#workflow-visualizer-app .detail-subtitle {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-gray-800);
  margin-bottom: var(--spacing-sm);
}

#workflow-visualizer-app .detail-content {
  color: var(--color-gray-700);
  line-height: 1.6;
  margin: 0;
}

#workflow-visualizer-app .detail-hint {
  color: var(--color-gray-400);
  font-style: italic;
  font-size: 0.875rem;
}

#workflow-visualizer-app .code-block {
  background: var(--color-gray-100);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--color-gray-800);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: var(--spacing-sm) 0;
}

/* Metadata */
#workflow-visualizer-app .metadata-item {
  margin-bottom: 8px;
}
#workflow-visualizer-app .metadata-item ul {
  list-style: circle;
  padding: 0;
  margin: 0 0 var(--spacing-sm);
}
#workflow-visualizer-app .metadata-item ul li {
  margin-left: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
}

/* Badges */
#workflow-visualizer-app .badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  margin-left: var(--spacing-sm);
}

#workflow-visualizer-app .badge-success {
  background: var(--color-success);
  color: var(--color-white);
}

/* Transitions list */
#workflow-visualizer-app .transitions-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

#workflow-visualizer-app .transition-item {
  background: var(--color-white);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

#workflow-visualizer-app .transition-item:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  background: #f0f9ff;
}

#workflow-visualizer-app .transition-trigger {
  font-weight: 600;
  color: var(--color-gray-900);
  margin-bottom: 0.25rem;
}
#workflow-visualizer-app .transition-target {
  color: var(--color-primary);
  font-weight: 500;
  margin-bottom: 0.25rem;
}
#workflow-visualizer-app .transition-reason {
  color: var(--color-gray-600);
  font-size: 0.875rem;
}

/* Back button */
#workflow-visualizer-app .back-button {
  background: none;
  border: none;
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  margin-right: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

#workflow-visualizer-app .back-button:hover {
  background: var(--color-gray-100);
}

/* Error */
#workflow-visualizer-app .error-container {
  position: absolute;
  bottom: var(--spacing-lg);
  right: var(--spacing-lg);
  z-index: 1000;
}

#workflow-visualizer-app .error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: var(--color-error);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  max-width: 300px;
  box-shadow: var(--shadow-md);
}

#workflow-visualizer-app .error-close {
  background: none;
  border: none;
  color: var(--color-error);
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0;
}

/* Review perspectives */
#workflow-visualizer-app .review-perspective {
  background: var(--color-gray-50);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

#workflow-visualizer-app .review-role {
  font-weight: 600;
  color: var(--color-gray-700);
  margin: 0 0 4px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

#workflow-visualizer-app .review-prompt {
  color: var(--color-gray-600);
  font-size: 0.875rem;
  margin: 0;
}

/* SVG diagram */
#workflow-visualizer-app .diagram-canvas svg {
  max-width: 100%;
  height: auto;
}
</style>
