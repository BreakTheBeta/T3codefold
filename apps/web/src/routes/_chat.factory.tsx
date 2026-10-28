import { createFileRoute } from "@tanstack/react-router";
import { FactoryPage } from "../components/factory/FactoryPage";

export const Route = createFileRoute("/_chat/factory")({ component: FactoryPage });
