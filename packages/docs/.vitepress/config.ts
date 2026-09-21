import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Responsible Vibe MCP',
  description:
    'Model Context Protocol server for intelligent conversation state management and development guidance',
  base: '/workflows/',
  ignoreDeadLinks: true,
  rewrites: {
    'README.md': 'index.md',
  },

  themeConfig: {
    nav: [
      { text: 'Documentation', link: '/' },
      { text: 'Workflows', link: '/workflows' },
      { text: 'Visualizer', link: '/workflows/visualizer' },
      {
        text: 'Github',
        link: 'https://github.com/codemcp/workflows',
      },
    ],

    sidebar: [
      {
        text: 'User Guide',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'How It Works', link: '/user/how-it-works' },
          { text: 'Agent Setup', link: '/user/agent-setup' },
          { text: 'Capability Routing', link: '/user/capability-routing' },
          { text: 'Vibe Engineering', link: '/user/advanced-engineering' },
          { text: 'Tutorial', link: '/user/tutorial' },
        ],
      },
      {
        text: 'Workflows',
        items: [
          { text: 'Workflow-Selection', link: '/user/workflow-selection' },
          { text: 'Packaged Workflows', link: '/user/packaged-workflows' },
          { text: 'Custom Workflows', link: '/user/custom-workflows' },
          { text: 'Explore All Workflows', link: '/workflows' },
          { text: 'Workflow Visualizer', link: '/workflows/visualizer' },
        ],
      },
    ],
  },

  head: [['link', { rel: 'icon', href: '/workflows/favicon.ico' }]],
});
