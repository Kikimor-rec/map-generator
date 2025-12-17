import { useEffect } from 'react'
import { EditorProvider, useEditor, actions } from '@store/EditorContext'
import { EditorLayout } from '@ui/layout/EditorLayout'
import { ErrorBoundary } from '@ui/ErrorBoundary'

function AppContent() {
  const { state, dispatch } = useEditor()

  // Create initial project on mount
  useEffect(() => {
    if (!state.project) {
      dispatch(actions.newProject('New Spaceship'))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state.project) {
    return (
      <div className="flex items-center justify-center h-screen bg-space-900 text-cyber-400">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  return <EditorLayout />
}

function App() {
  return (
    <ErrorBoundary>
      <EditorProvider>
        <AppContent />
      </EditorProvider>
    </ErrorBoundary>
  )
}

export default App
