//import Decoration from "../../../assets/images/fantasy-border.png";
import UnityCanvas from "./UnityCanvas";
//import Controller from "./Controller";

export default function Frame(){
    return (
        <div className="hidden sm:flex min-h-screen w-full align-middle justify-center">
            {/* * Background image must occupy 100% of body and appear behind other components
            <img src={Decoration} className="top-0 left-0 h-full w-full absolute" /> */}

            {/* Controller and canvas need to be center and occupy 80% of body*/}
            <div className="min-w-[900px] sm:min-w-[900px] h-[500px] mt-[5%] py-4 px-6 flex align-middle justify-center">
                {/* <Controller /> */}
                <UnityCanvas />
            </div>
        </div>
    );
}