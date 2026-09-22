import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import permissionData from '../permissions.json';
import roleData from '../roles.json';
import sourceData from '../source.json';
import legacySource from '../app.bundle.js?raw';
import '../roles.css';
import '../styles.css';
import './host.css';

type RuntimeState = 'loading' | 'ready' | 'error';

const escapeScriptText = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

function LegacyPrototypeHost() {
  const hasStarted = useRef(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('loading');

  useEffect(() => {
    if (hasStarted.current || window.__auditSphereLegacyLoaded) {
      setRuntimeState('ready');
      return;
    }

    hasStarted.current = true;

    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);

    const modalRoot = document.createElement('div');
    modalRoot.id = 'modal-root';
    document.body.appendChild(modalRoot);

    const toasts = document.createElement('div');
    toasts.id = 'toasts';
    toasts.className = 'toast-stack';
    toasts.setAttribute('aria-live', 'polite');
    document.body.appendChild(toasts);

    const documentPicker = document.createElement('input');
    documentPicker.id = 'document-picker';
    documentPicker.className = 'hidden';
    documentPicker.type = 'file';
    documentPicker.accept = '.pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg';
    document.body.appendChild(documentPicker);

    const trialBalancePicker = document.createElement('input');
    trialBalancePicker.id = 'tb-picker';
    trialBalancePicker.className = 'hidden';
    trialBalancePicker.type = 'file';
    trialBalancePicker.accept = '.csv,text/csv';
    document.body.appendChild(trialBalancePicker);

    const data = [
      ['prd-data', sourceData],
      ['role-data', roleData],
      ['permission-data', permissionData],
    ] as const;

    for (const [id, value] of data) {
      const node = document.createElement('script');
      node.id = id;
      node.type = 'application/json';
      node.textContent = escapeScriptText(value);
      document.body.appendChild(node);
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.dataset.runtime = 'legacy-role-portal';
    script.text = legacySource;

    try {
      window.__auditSphereLegacyLoaded = true;
      document.body.appendChild(script);
      script.remove();
      setRuntimeState('ready');
    } catch (error) {
      window.__auditSphereLegacyLoaded = false;
      console.error('AuditSphere legacy runtime failed to start.', error);
      setRuntimeState('error');
    }
  }, []);

  return (
    <div
      className="runtime-status"
      hidden={runtimeState === 'ready'}
      role={runtimeState === 'error' ? 'alert' : 'status'}
    >
      {runtimeState === 'error'
        ? 'The AuditSphere prototype could not be started. Check the browser console for details.'
        : 'Loading the AuditSphere role workspace…'}
    </div>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('AuditSphere React root element is missing.');
}

const reactRoot = window.__auditSphereReactRoot ?? createRoot(rootElement);
window.__auditSphereReactRoot = reactRoot;
reactRoot.render(<LegacyPrototypeHost />);
