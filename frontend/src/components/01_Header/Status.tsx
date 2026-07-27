import { useState } from 'react';
import { useSelector } from "react-redux";
import Material from "../../assets/Material";
import { RootState } from "../../state/Context";
import { UserData } from "../../types";

export default function Status() {
  const userBalance = useSelector<RootState, UserData["balance"]>(state => state.session.balance);
  const [open, setOpen] = useState<boolean>(false);

  return (
    <div className="text-white w-54 h-full flex align-middle justify-center">
      <Material.ClickAwayListener onClickAway={() => setOpen(false)}>
        <Material.List disablePadding={true} sx={{marginTop: "4px"}} >
          <Material.ListItem onClick={() => setOpen(state => !state)} >
            <Material.ListItemText primary={userBalance.available ?  `Available: ${userBalance.available}` : '0'} />
            <Material.ListItemIcon sx={{display: "flex", justifyContent: "center"}}>
              {open ? <Material.ExpandLessRounded /> : <Material.ExpandMoreRounded />}
            </Material.ListItemIcon>
          </Material.ListItem>
          {open ?
          <div className="bg-[#0B022D]">
          <Material.ListItem >
            <Material.ListItemText primary={userBalance.preparing ?  `Preparing: ${userBalance.preparing}` : '0'} />
          </Material.ListItem> 
          <Material.ListItem>
            <Material.ListItemText primary={userBalance.withdrawable ?  `Withdrawable: ${userBalance.withdrawable}` : '0'} />
          </Material.ListItem>
          </div> : null
          }
        </Material.List>
      </Material.ClickAwayListener>
    </div>
  )
}
