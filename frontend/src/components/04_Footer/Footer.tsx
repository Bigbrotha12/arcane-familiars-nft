import Material from "../../assets/Material";

export default function Footer() {
  
  return (
    <div className="flex flex-col bg-[#242424] p-12">
      <div className=" text-white mx-auto">
        <Material.Typography variant='h5'>Follow Us!</Material.Typography>
        <div className="flex justify-center">
        <Material.Twitter />
        <Material.Facebook />
        </div>
      </div>

      <div className="flex justify-between gap-6">
        <div className="text-white">
          <Material.Typography sx={{fontSize: '.75rem'}} color='inherit'>Privacy Policy</Material.Typography>
          <Material.Typography sx={{fontSize: '.75rem'}} color='inherit'>Terms and Conditions</Material.Typography>

        </div>

        <div className="text-white">
          <Material.Typography variant='h6' color='inherit'>Contact</Material.Typography>
          <Material.Typography color='inherit'>email us @ gaias.keepers@hotmail.com</Material.Typography>
        </div>
      </div>

    </div>
      
  )
}
