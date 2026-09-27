import { Component } from 'react';

/** Contains a render error to one workspace instead of blanking the whole app. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('RepoMind workspace error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel workspace-error" role="alert">
        <h2>This workspace hit an unexpected error</h2>
        <p className="muted">{this.state.error.message || String(this.state.error)}</p>
        <button onClick={() => this.setState({ error: null })}>↻ Reload workspace</button>
      </section>
    );
  }
}
