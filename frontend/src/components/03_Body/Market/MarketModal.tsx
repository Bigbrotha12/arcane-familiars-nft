import { useState } from 'react';
import Material from '@mui/material';
import FamiliarCard from '../Collection/FamiliarCard';

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

export default function BasicModal(props: { data: string, stats: string}) {
  const [open, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  return (
    <div>
      <Material.Button onClick={handleOpen}>Open modal</Material.Button>
      <Material.Modal
        open={open}
        onClose={handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
      >
        <Material.Box sx={style}>
          <FamiliarCard familiarData={props.data} familiarStats={props.stats}/>
        </Material.Box>
      </Material.Modal>
    </div>
  );
}
