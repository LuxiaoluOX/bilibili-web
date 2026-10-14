import type { ReactNode } from "react";

export function OperationsHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="settings-title operations-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions ? <div className="operations-heading-actions">{actions}</div> : null}</header>;
}

export function OperationsSummary({ icon, title, status, children, actions }: { icon: ReactNode; title?: ReactNode; status?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return <section className="operations-summary" aria-label="当前状态"><span className="operations-summary-icon" aria-hidden="true">{icon}</span><div className="operations-summary-content">{title || status ? <div className="operations-summary-lead">{title ? <strong>{title}</strong> : null}{status}</div> : null}<div className="operations-summary-meta">{children}</div></div>{actions ? <div className="operations-summary-actions">{actions}</div> : null}</section>;
}
