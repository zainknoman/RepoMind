import { Component } from 'react';
import { STALE_BUILD_MESSAGE, isStaleBuildError } from '../lib/staleBuild';

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
    const { error } = this.state;
    if (!error) return this.props.children;
    // A lazily loaded workspace from a previous deploy can only be fixed by loading the new build.
    if (isStaleBuildError(error))
      return (
        <section className="panel workspace-error" role="alert">
          <h2>RepoMind has been updated</h2>
          <p className="muted">{STALE_BUILD_MESSAGE}</p>
          <button onClick={() => window.location.reload()}>↻ Reload page</button>
        </section>
      );
    return (
      <section className="panel workspace-error" role="alert">
        <h2>This workspace hit an unexpected error</h2>
        <p className="muted">{error.message || String(error)}</p>
        <button onClick={() => this.setState({ error: null })}>↻ Reload workspace</button>
      </section>
    );
  }
}
