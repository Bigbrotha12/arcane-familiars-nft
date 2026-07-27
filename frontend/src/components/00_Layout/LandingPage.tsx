
import LandingHeader from "../01_Header/LandingHeader";
import LandingBody from "../03_Body/LandingBody";
import Footer from "../04_Footer/Footer";

export default function LandingPage(): JSX.Element {
    const navItems: Array<{ title: string, link: string }> = [
        { title: "Home", link: "/" },
        { title: "Docs", link: "/app" },
        { title: "Support", link: "/app" },
        { title: "Play Now", link: "/app" }
    ]

    return (
        <div>
            <LandingHeader items={navItems} />
            <LandingBody />
            <Footer />
        </div>
    )
}