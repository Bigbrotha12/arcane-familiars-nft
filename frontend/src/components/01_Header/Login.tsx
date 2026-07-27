import { useState, useContext, Fragment } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from "../../state/Context";
import Material from "../../assets/Material";
import Formatter from "../../app/utils/Formatter";
import { IMXHandler } from "../../types";
import { IMX } from "../../state/Context";

export default function Login() {
  const userAddress = useSelector<RootState, string>(state => state.session.address);
  const [menu, setMenu] = useState<{ anchor: HTMLElement | null, open: boolean }>({ anchor: null, open: false });
  const [client,,,] = useContext<IMXHandler>(IMX);
  
  return (
    <div className="flex align-middle justify-center px-8 text">
      <Material.ClickAwayListener onClickAway={() => setMenu(state => { return { ...state, open: false } })}>
        <Fragment>
        {userAddress ?
            <div className="hidden md:block text-white mx-3 my-auto border-2 border-transparent hover:border-2 hover:border-white  px-3 py-1" onClick={(event) => setMenu({ anchor: event.target as HTMLElement, open: true})}>
              <Material.Typography sx={{fontFamily: 'inherit',letterSpacing: '0.05rem' }}>
                {Formatter.formatAddress(userAddress)}
              </Material.Typography>
            </div> : 
        <button className='bg-white p-3 rounded-md my-auto hover:bg-purple-500 hover:shadow-md font-bold'
            color='inherit'
            onClick={client.connect}>
          Connect
        </button>}

        {menu &&
          <Material.Menu anchorEl={menu.anchor} open={menu.open} onClose={() => setMenu(state => { return { ...state, open: false } })}>
            <Material.MenuItem onClick={client.disconnect}>Disconnect</Material.MenuItem>
          </Material.Menu>}
        </Fragment>
      </Material.ClickAwayListener>
    </div>
  )
}
