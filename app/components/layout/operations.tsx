import type { ReactNode } from "react";

export function OperationsHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="settings-title operations-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions ? <div className="operations-heading-actions">{actions}</div> : null}</header>;
}

export function OperationsSummary({ icon, title, status, children, actions }: { icon: ReactNode; title: ReactNode; status?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return <section className="connection-summary operations-summary" aria-label="当前状态"><span className="settings-summary-icon">{icon}</span><div className="connection-summary-account"><div className="connection-summary-name"><strong>{title}</strong>{status}</div><div className="connection-summary-meta">{children}</div></div>{actions ? <div className="operations-summary-actions">{actions}</div> : null}</section>;
}
