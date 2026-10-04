import { createContext, useContext, useState } from "react";

const BranchFilterContext = createContext(null);

export function BranchFilterProvider({ children }) {
  // null = "all branches" (only meaningful for owners; staff get pinned to their own)
  const [selectedBranch, setSelectedBranch] = useState(null);

  return (
    <BranchFilterContext.Provider value={{ selectedBranch, setSelectedBranch }}>
      {children}
    </BranchFilterContext.Provider>
  );
}

export const useBranchFilter = () => useContext(BranchFilterContext);