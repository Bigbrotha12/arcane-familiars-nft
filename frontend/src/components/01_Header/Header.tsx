import { useSelector } from "react-redux";
import Validator from "../../app/utils/Validator";
import profilePic from "../../assets/icons/profilePic.png";
import Material from "../../assets/Material";
import { RootState } from "../../state/Context";

export default function Header() {
  const userAddress = useSelector<RootState, string>(state => state.session.address);

  return (
    <header className="bg-[#242424] flex p-3 bg-primary border-2 border-gray-700 gap-3">
      <div id='user-address' className='relative flex ml-auto '>
          <div className="after:content-[''] after:absolute after:h-3 after:w-3 after:bg-green-500 after:rounded-3xl after:right-0 after:bottom-0 after:border-2 after:border-[#242424]">
              <img className="rounded-3xl" src={profilePic} width='45px' height='45px' alt='profile picture' />
          </div>   
      </div>
      <div className="hidden md:block text-white mx-3 my-auto border-2 border-transparent hover:border-2 hover:border-white  px-3 py-1">
        <Material.Typography sx={{ fontFamily: 'inheirt', letterSpacing: '0.05rem' }}>
          {Validator.isValidAddress(userAddress) ? userAddress : ''}
        </Material.Typography>
      </div>

      { !Validator.isValidAddress(userAddress) &&
        <div>
          <button className='bg-white p-3 rounded-md my-auto hover:bg-purple-500 hover:shadow-md font-bold' color='inherit'>
            Connect
          </button>
        </div>
      }
      
    </header>
  )
}
