import Material from "../../../assets/Material";

export default function SearchBar() {
  return (
    <div className="bg-white h-14 relative top-0 w-full flex flex-row justify-between align-middle">
      <FamiliarCount count={6} />
      <div className="pt-2">
        <Search />
      </div>
      <Material.Stack sx={{paddingTop: "1rem", paddingLeft: "1rem"}}>
        <Material.Pagination count={5} color="secondary" />
      </Material.Stack>
    </div>
  );
}

function FamiliarCount(props: any) {
  return (
    <div className="pt-4 pl-4 font-bold">
      <p>Familiars: {props.count}</p>
    </div>
  );
}

function Search() {
  return (
    <div className="flex flex-row bg-[#D9D9D9] rounded-[12px] p-1 w-60">
      <div className="mx-4 my-auto">
        <Material.SearchIcon />
      </div>
      <Material.Input placeholder="Search…" />
    </div>
  );
}
