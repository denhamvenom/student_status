import { create } from 'zustand'

interface UiState {
  moreOpen: boolean
  toggleMore: () => void
  closeMore: () => void
}

export const useUiStore = create<UiState>(set => ({
  moreOpen: false,
  toggleMore: () => set(state => ({ moreOpen: !state.moreOpen })),
  closeMore: () => set({ moreOpen: false }),
}))
