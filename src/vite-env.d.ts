/// <reference types="vite/client" />

interface Window {
  __auditSphereLegacyLoaded?: boolean;
  __auditSphereReactRoot?: ReturnType<typeof import('react-dom/client').createRoot>;
}
