import { Outlet } from "react-router-dom";

export default function Body() {
  return (
    <div className="flex bg-[#242424] relative justify-center h-full w-full min-h-screen">
        <Outlet />
    </div>
  )
}