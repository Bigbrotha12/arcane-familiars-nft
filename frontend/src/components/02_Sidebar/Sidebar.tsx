import Config from "../../app/constants/AppConfig"
import { Link } from "react-router-dom";
import Material from "../../assets/Material";

export default function Sidebar() {
  return (
    <div className="hidden md:block px-6 h-screen shadow-[0_8px_6px_-6px_rgba(0,0,0,0.8)]">
      <Material.List sx={{fontFamily: 'inherit'}}>
        {createSections()}
      </Material.List>
    </div>
  )
}

function createSections(): Array<JSX.Element> {
    return Config.SiteContent.sidebar.map( section => {
      return (
        <div className='text-dark-primary' key={section.title} >
          <Material.ListItem>
            <Material.ListItemText>
              <Material.Typography sx={{ fontWeight: 'bold', fontFamily: 'inherit' }} color='inherit'>
                {section.title}
              </Material.Typography>
            </Material.ListItemText>
          </Material.ListItem>
          <Material.Divider />
          {createItems(section)}
        </div>)
    })
  }

  function createItems(section: any): Array<JSX.Element> {
      return section.content.map((item: any) => {
        return (
        <div className='my-3 hover:bg-purple-300' key={item.label}>
          <Material.ListItem>
            <Material.ListItemIcon>
              <Material.PlayArrow />
            </Material.ListItemIcon>
              <Link to={item.link}>
                <Material.Typography sx={{ fontFamily: 'inherit' }}>
                  {item.label}
                </Material.Typography>
              </Link>
          </Material.ListItem>
        </div>)
      })
  }
