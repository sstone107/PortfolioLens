// components/common/TitleManager.tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useResource, useRouterContext } from "@refinedev/core";

export const TitleManager = () => {
  const { pathname } = useLocation();
  const { resources } = useResource();
  const { routes } = useRouterContext();

  useEffect(() => {
    // Find resource by checking if pathname includes any of the resource routes
    const matchedResource = resources.find((res) => {
      // Extract resource route safely as a string
      const resourceRoute = typeof res.route === 'string' ? res.route : 
                           typeof res.list === 'string' ? res.list : 
                           res.name;
      
      return pathname.includes(resourceRoute);
    });

    // Use meta.title as first priority for the page title
    const resourceTitle =
      matchedResource?.meta?.title ||
      matchedResource?.meta?.label ||
      matchedResource?.name ||
      "PortfolioLens";

    document.title = `${resourceTitle} | PortfolioLens`;
    
    // Debug the title setting
    console.log(`[TitleManager] Set title to: ${document.title} for path: ${pathname}`);
  }, [pathname, resources, routes]);

  return null;
};

export default TitleManager;
