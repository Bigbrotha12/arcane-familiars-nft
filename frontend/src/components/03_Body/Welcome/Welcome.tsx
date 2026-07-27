import Material from "../../../assets/Material";

export default function Welcome() {
    return (
        <div className="flex flex-col gap-y-3 align-middle justify-center my-auto">
            <Material.Typography color='whitesmoke'>Select an Item</Material.Typography>
            <img src='https://picsum.photos/id/237/600/400' style={{ width: 600, height: 400}}/>
            
        </div>
    )
}