import Material from "../../assets/Material";
import { Link } from "react-router-dom";
import Logo from "../../assets/icons/Logo.svg";
import profilePic from "../../assets/icons/profilePic.png";
import Login from "./Login";
import { useSelector } from "react-redux";
import { RootState } from "../../state/Context";

export default function LandingHeader(props: { items: Array<{title: string, link: string}>}): JSX.Element {
    const userAddress = useSelector<RootState, string>(state => state.session.address);

    return (
        <header className="bg-[#242424] flex p-3 bg-primary border-2 border-gray-700 gap-3">
            <img className="mx-3" src={Logo} height='32px' width='32px' alt="Gaia's Guardians" />
            
            <nav className="hidden md:block text-white my-auto">
                {
                    props.items.map(item => {
                        return (
                            <Link key={item.title} to={item.link}>
                                <Material.Button color='inherit'>{item.title}</Material.Button>
                            </Link>
                        )
                    })
                }
            </nav>
            
            <div id='user-address' className='relative flex ml-auto'>
                <div className={`after:content-[''] after:absolute after:h-3 after:w-3 ${userAddress != '' ? "after:bg-green-500" : "after:bg-red-500"} after:rounded-3xl after:right-0 after:bottom-0 after:border-2 after:border-[#242424]`}>
                    <img className="rounded-3xl" src={profilePic} width='45px' height='45px' alt='profile picture' />
                </div>   
            </div>
            {/* <p className="hidden md:block text-white mx-3 my-auto">0x9333.54fac</p> */}

            <Login />
            {/* <div>
                <button className='bg-white p-3 rounded-md my-auto' color='inherit'>Connect</button>
            </div> */}
        </header>
    )
}