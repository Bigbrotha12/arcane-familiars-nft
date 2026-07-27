import Material from "../../assets/Material";
import Claudio from "../../assets/images/Claudio.png";
import Renny from "../../assets/images/Renny.png";
import Tommy from "../../assets/images/Tommy.png";
import Alan from "../../assets/images/Alan.png";
import Steve from "../../assets/images/Steve.png";
import Sandy from "../../assets/images/Sandy.png";
import gameImage from "../../assets/images/gaming-consoles.jpg";
import { Link } from "react-router-dom";

export default function LandingBody(): JSX.Element {
    return (
        <div className=" bg-dark-primary">
            <section id='welcome-section' className="flex align-middle relative h-screen">
                <div className="
                before:content-[''] 
                before:absolute
                before:top-0
                before:bottom-0
                before:left-0
                before:right-0
                before:bg-mainBackdrop
                before:bg-cover
                before:bg-center
                before:bg-no-repeat ">
                <div className="flex flex-col md:max-w-[40%] text-[#ffffff] leading-6 min-h-full px-16 bg-purple-700 mix-blend-multiply">
                    <div className="my-auto">
                    {/* <Material.Typography variant="h3" sx={{fontWeight: 'bold', marginBottom: '12px', backgroundColor: 'limegreen', borderRadius: '12px', paddingX: '12px', paddingY: '6px'}}>Gaia's Keepers</Material.Typography> */}
                    <Material.Typography variant="h2" sx={{fontSize: '4rem', fontWeight: 'bold', marginBottom: '48px'}} textAlign='center'>Heal the World</Material.Typography>
                    <Material.Typography sx={{mixBlendMode: 'plus-lighter'}} fontSize='2rem' textAlign='center' color='inherit'>Lorem ipsum dolor sit amet, consectetur adipiscing elit,
                    sed do eiusmod tempor incididunt ut labore et dolore magna
                    aliqua.</Material.Typography>
                    </div>
                </div>
                </div>
            </section>

            <section id='service-section' className="flex align-middle py-[10rem] relative before:content-[''] before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:h-3 before:bg-blue-200  after:content-[''] after:absolute after:top-[100%] after:right-0 after:bottom-0 after:left-0 after:h-3 after:bg-orange-200">
                <div className="my-auto mx-12 text-[#f0f0f0] leading-6">
                    <h6 className="text-[4rem] text-bold mb-12">Play in Browser!</h6>
                    <Material.Typography sx={{maxWidth: "50%"}}>
                        Adipisicing tempor ut quis aliquip id sunt Lorem. Veniam reprehenderit cupidatat non est sit ea do ut et.
                        Sint ut enim eu magna occaecat laboris et sint dolore eu ipsum sit. Culpa proident ad commodo laboris
                        dolore sit aliquip aute qui.
                    </Material.Typography>
                    <Link to="/app"><button className='text-[#f0f0f0] border-[1px] border-[#f0f0f0] rounded-md my-3 px-4 py-2 hover:bg-purple-400'>Play Now</button></Link>
                </div>
            </section>

            <section id='how-to-play-section' className="py-[10rem] flex align-middle ">
                <div className="flex flex-col md:flex-row my-auto justify-center px-8 text-[#f0f0f0] leading-6">
                    <Material.Card sx={{maxWidth: {xs: '100%', md: '30%'}, backgroundColor: '#0000', boxShadow: 'none', marginBottom: '12px'}}>
                        <Material.CardMedia component='img' src={gameImage} width='256px' height='256px' alt='Gaming console' />
                    </Material.Card>
                    <div className="mx-6 md:max-w-[60%]">
                        <Material.Typography sx={{marginBottom: '2rem', fontSize: '4rem'}} variant='h5'>How to Play</Material.Typography>
                        <Material.Typography sx={{marginBottom: '2rem'}}>
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit,
                            sed do eiusmod tempor incididunt ut labore et dolore magna
                            aliqua. Ut enim ad minim veniam, quis nostrud exercitation
                            ullamco laboris nisi ut aliquip ex ea commodo consequat.
                            Duis aute irure dolor in reprehenderit in voluptate velit esse
                            cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
                            cupidatat non proident, sunt in culpa qui officia deserunt mollit
                            anim id est laborum.
                        </Material.Typography>
                        <Link to="/app"><Material.Button sx={{color: '#f0f0f0', borderColor: '#f0f0f0', marginBottom: '12px'}} variant='outlined'>Play Now</Material.Button></Link>
                    </div>
                    
                    
                </div>
            </section>

            <section id='animals-section' className="flex justify-center align-middle py-3">
                <div className="my-auto mx-6 text-[#f0f0f0] leading-6 justify-center">
                    <h6 className="text-center text-2xl text-bold mb-12">Meet Gaia's Guardians</h6>
                    <CharacterCard cardData={[
                        {title: "Claudio", subtitle: "The Penguin", description: "Claudio loves ice cream and likes to keep cool. He often complains about the heat and likes to play around with Sandy in the sea.", image: Claudio, },
                        {title: "Renny", subtitle: "The Bunny", description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio officia laboriosam aliquam est esse dolorum reiciendis dolorem provident maiores accusantium.", image: Renny },
                        {title: "Sandy", subtitle: "The Fish", description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio officia laboriosam aliquam est esse dolorum reiciendis dolorem provident maiores accusantium.", image: Sandy },
                        {title: "Tommy", subtitle: "The Caveman", description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio officia laboriosam aliquam est esse dolorum reiciendis dolorem provident maiores accusantium.", image: Tommy },
                        {title: "Alan", subtitle: "The Squirrel", description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio officia laboriosam aliquam est esse dolorum reiciendis dolorem provident maiores accusantium.", image: Alan },
                        {title: "Steve", subtitle: "The Hawk", description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio officia laboriosam aliquam est esse dolorum reiciendis dolorem provident maiores accusantium.", image: Steve }
                    ]} />
                    
                </div>
            </section>

        </div>
    )
}

function CharacterCard(props: {cardData: {title: string, subtitle: string, description: string, image: string}[]}): JSX.Element {

    return (
    <Material.Grid container justifyContent='center' spacing={2}>
        {
            props.cardData.map( data => {
                return ( 
                    <Material.Grid key={data.title} md={2}>
                        <div className="
                        bg-white 
                        rounded-md 
                        relative
                        hover:scale-[1.20]
                        hover:ease-in-out 
                        hover:z-10
                        duration-200
                        ">
                            <div className="hover:bg-[rgba(32,32,32,0.6)] hover:text-white text-transparent text-sm p-3 absolute top-0 right-0 left-0 bottom-0 ">{data.description}</div>
                            <div className="max-w-[256px] ">
                            <img
                                className="rounded-t-md"
                                src={data.image}
                                height='96'
                                alt={`${data.title} ${data.subtitle}`}
                            />
                            <div className="p-4">
                                <Material.Typography fontWeight='bold' color='black'>{data.title}</Material.Typography>
                                <Material.Typography color='black'>{data.subtitle}</Material.Typography>
                            </div>
                            </div>
                        </div>
                    </Material.Grid>  
                )
            })
        }
        
    </Material.Grid>
    )
}