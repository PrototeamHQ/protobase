import { Component, type ReactNode } from 'react'
import { Problem } from './problem'

type CustomBoundaryProps = {
  /** The component's name, for the warning. */
  name: string
  /** What is drawn instead when it throws; a warning naming it by default. */
  fallback?: ReactNode
  children: ReactNode
}

/** Draws a warning in place of a project's or plugin's component that throws, so one component cannot blank the app. */
export class CustomBoundary extends Component<CustomBoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return this.props.fallback === undefined ? <Problem>{this.props.name} could not be drawn.</Problem> : this.props.fallback
  }
}
