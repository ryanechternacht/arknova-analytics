import { Component, type ReactNode } from 'react';

// Keeps a rendering bug in the dashboard from blanking the whole page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error">
          Something went wrong showing this game: {this.state.error.message}. Try reloading it, and if it keeps
          happening, download the game data so the bug can be reproduced.
        </div>
      );
    }
    return this.props.children;
  }
}
