import Material from "../../assets/Material";

export default function ComingSoon(): JSX.Element {
    return (
        <div className="flex justify-center min-h-screen w-4/5 relative">
            <Material.Typography sx={{fontSize: "4rem", color: "white", marginBlock: "auto" }}>
                Not Available is Demo Version.
            </Material.Typography>
        </div>
    ); 
}