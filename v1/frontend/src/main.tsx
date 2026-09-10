import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { ApplicationWorkspace } from './ApplicationWorkspace';
import './workspaceStyles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#285b48',
          colorInfo: '#285b48',
          colorText: '#263c34',
          colorTextSecondary: '#77827b',
          colorBgLayout: '#f7f8f5',
          borderRadius: 8,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 13,
          controlHeight: 36,
        },
        components: {
          Button: { primaryShadow: 'none' },
          Table: {
            headerBg: '#fafbf8',
            headerColor: '#7d887e',
            rowHoverBg: '#f4f7f0',
            cellPaddingBlock: 18,
          },
          Tabs: { horizontalItemGutter: 28 },
          Tree: { nodeSelectedBg: '#dfeadd', nodeHoverBg: '#edf1e8' },
        },
      }}
    >
      <App>
        <ApplicationWorkspace />
      </App>
    </ConfigProvider>
  </React.StrictMode>,
);
