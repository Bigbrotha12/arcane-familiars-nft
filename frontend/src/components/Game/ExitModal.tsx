import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

interface ExitModalProps {
  open: boolean
  onSaveAndExit: () => void
  onExitWithoutSave: () => void
  onCancel: () => void
  saving: boolean
}

export default function ExitModal({ open, onSaveAndExit, onExitWithoutSave, onCancel, saving }: ExitModalProps) {
  const [confirmDangerous, setConfirmDangerous] = useState(false)

  if (confirmDangerous) {
    return (
      <Modal open={open} onClose={() => { setConfirmDangerous(false); onCancel() }}>
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-text-primary mb-2">
            Unsaved Progress
          </p>
          <p className="font-body text-sm text-text-secondary mb-6">
            Any unsaved progress will be lost. Are you sure you want to leave without saving?
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDangerous(false)}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" onClick={onExitWithoutSave}>
              Leave Anyway
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onCancel} title="Leave Game?">
      <div className="flex flex-col gap-3">
        <Button
          className="w-full"
          size="md"
          onClick={onSaveAndExit}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save & Exit'}
        </Button>
        <Button
          variant="ghost"
          size="md"
          className="w-full"
          onClick={() => setConfirmDangerous(true)}
        >
          Exit Without Saving
        </Button>
      </div>
    </Modal>
  )
}
