import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import WorkflowVisualizer from '../components/WorkflowVisualizer.vue';

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    });
  },
  enhanceApp({ app, router: _router, siteData: _siteData }) {
    // Register global components
    app.component('WorkflowVisualizer', WorkflowVisualizer);
  },
} satisfies Theme;
