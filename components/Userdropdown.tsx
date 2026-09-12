"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import NavItems from "@/components/NavItems";
import { signOut } from "@/lib/actions/auth_actions";

const Userdropdown = ({user}: {user: User}) => {
  const  router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/sign-in");
    

  }

  return (
    <DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" className="flex items-center gap-3 text-gray-4 hover:text-yellow-500">
    <Avatar className="h-8 w-8">
      {/*<AvatarImage src="https://github.com/shadcn.png" />*/}
      <AvatarFallback className="bg-yellow-500 text-yellow-900 text-sm font-bold">
        {user.name[0]}
      </AvatarFallback>
    </Avatar>
    <div className="hidden md:flex flex-col items-start ">
      <span className='text-base font-medium text-gray-400'>
        {user.name}
      </span>

    </div>

    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent className="text-gray-400">
    <DropdownMenuLabel>
      <div className="flex relative items gap-3 py-2">
      <Avatar className="h-10 w-10">
        {/*<AvatarImage src="https://github.com/shadcn.png" />*/}
        <AvatarFallback className="bg-yellow-500 text-yellow-900 text-sm font-bold">
          {user.name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className='text-base font-medium text-gray-400'>
          {user.name}
        </span>
          <span className="text-sm text-grey-500">{user.email}</span>

      </div>


      </div>

    </DropdownMenuLabel>
    <DropdownMenuSeparator className="bg-grey-600" />
    <DropdownMenuItem onClick={handleSignOut} className="text-grey-100 text-md font-medium focus:bg-transparent focus:text-yellow-500 transition-colors cursor-pointer">
      <LogOut className="h-4 w-4 mr-2 hidden sm:block" />
      Logout


    </DropdownMenuItem>
    <DropdownMenuSeparator className="bg-grey-600" />
    <nav className="sm:hidden">
      <NavItems />

    </nav>
    

    


 
  </DropdownMenuContent>
</DropdownMenu>
  )
}

export default Userdropdown

