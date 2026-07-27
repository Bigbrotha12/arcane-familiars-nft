import Material from "../../assets/Material";

export default function ThemeToggler(): JSX.Element {


    return (
        <div className="flex align-middle justify-center">
            
            <Material.Switch sx={{margin: "auto"}} color="warning" />
            <Material.DarkModeIcon color="warning" sx={{margin: "auto"}} />
            
        </div>
    );
}