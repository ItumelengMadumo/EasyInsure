import { Component, type ErrorInfo, type ReactNode } from 'react';

export class PageErrorBoundary extends Component<
  { page: string; children: ReactNode; onReset: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`EasyInsure page "${this.props.page}" failed to render`, error, info);
  }
  componentDidUpdate(previous: { page: string }) {
    if (previous.page !== this.props.page && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="panel page-error" role="alert"><span>Page recovery</span><h1>This page could not be displayed.</h1><p>{this.state.error.message}</p><div><button className="primary" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>Return to overview</button><button className="secondary" onClick={() => window.location.reload()}>Reload workspace</button></div></section>;
  }
}
