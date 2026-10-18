import { Component, type ReactNode } from 'react';

export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className="p-6 space-y-4" role="alert">
        <h1 className="text-xl font-semibold">This page could not be loaded</h1>
        <p>Your saved data has not been removed. Reload to try again.</p>
        <button className="underline" onClick={() => window.location.reload()}>Reload page</button>
        <a className="block underline" href="/">Back to home</a>
      </main>
    );
  }
}
