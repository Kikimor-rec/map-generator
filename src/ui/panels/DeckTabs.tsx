import { useEditor, actions } from '@store/EditorContext'

export function DeckTabs() {
  const { state, dispatch } = useEditor()
  const { project, activeDeckId } = state

  if (!project) return null

  const handleAddDeck = () => {
    const name = prompt('Deck name:', `Deck ${project.decks.length + 1}`)
    if (name) {
      dispatch(actions.addDeck(name))
    }
  }

  const handleRemoveDeck = (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (project.decks.length > 1 && confirm('Remove this deck?')) {
      dispatch(actions.deleteDeck(deckId))
    }
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-space-800 border-b border-space-700">
      {project.decks.map((deck) => (
        <div
          key={deck.id}
          onClick={() => dispatch(actions.setActiveDeck(deck.id))}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-t text-sm transition-all cursor-pointer ${
            activeDeckId === deck.id
              ? 'bg-space-900 text-cyber-blue border-t border-x border-space-600'
              : 'text-space-400 hover:text-space-200 hover:bg-space-700'
          }`}
        >
          <span>🔲</span>
          <span>{deck.name}</span>
          {project.decks.length > 1 && (
            <button
              onClick={(e) => handleRemoveDeck(deck.id, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-cyber-pink ml-1 transition-opacity"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        onClick={handleAddDeck}
        className="px-2 py-1 text-space-500 hover:text-cyber-green transition-colors"
        title="Add Deck"
      >
        ➕
      </button>
    </div>
  )
}
