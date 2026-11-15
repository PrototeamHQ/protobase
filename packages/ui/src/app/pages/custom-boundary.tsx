import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportRenderError } from '../error-reporting'
import { Problem } from './problem'
import { text } from './messages'

type CustomBoundaryProps = {
  /** The component's name, for the warning. */
  name: string
  /** What is drawn instead when it throws; a warning naming it by default. */
  fallback?: ReactNode
  /** What it draws from, such as the resource's model: a new one gives a component that threw another try. */
  resetKey?: unknown
  children: ReactNode
}

/** Draws a warning in place of a project's or plugin's component that throws, so one component cannot blank the app. */
export class CustomBoundary extends Component<CustomBoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    reportRenderError(error, info.componentStack)
  }

  // A component that threw on what it drew from, such as a model cached from before the app's update, is drawn again
  // once that changes, rather than staying replaced until the page reloads
  override componentDidUpdate(previous: CustomBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return this.props.fallback === undefined ? <Problem>{text.rich('couldNotDraw', { name: this.props.name })}</Problem> : this.props.fallback
  }
}
