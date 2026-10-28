import type { EnvironmentId, FactoryCard } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { CardDetail } from "./FactoryPage";

const { answer } = vi.hoisted(() => ({ answer: vi.fn(async () => undefined) }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => true }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => answer }));
vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: undefined }) }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { factoryAnswerCard: { permissionAtom: () => null } },
}));

it("Enter on a focused option stages that option without sending a previously staged answer", async () => {
  const card = {
    id: "decision",
    revision: 1,
    ownerId: "worker",
    body: {
      title: "Choose a rollout",
      urgency: "now",
      blocking: true,
      context: { doing: "Prepare rollout", whyNotMe: "Owner choice", costOfWaiting: "Checks wait" },
      options: [
        {
          id: "A",
          label: "Run checks",
          recommended: true,
          nextStep: "Check",
          cost: "Low",
          reversibility: "reversible",
          consequences: "More evidence",
        },
        {
          id: "B",
          label: "Preview",
          recommended: false,
          nextStep: "Preview",
          cost: "Low",
          reversibility: "reversible",
          consequences: "Early feedback",
        },
      ],
      rationale: "Choose deliberately",
      caveats: [],
      links: [],
    },
  } as unknown as FactoryCard;
  answer.mockClear();
  await using screen = await render(
    <CardDetail environmentId={"local" as EnvironmentId} card={card} owner={undefined} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /A · Run checks/ }));
  const optionB = screen.getByRole("button", { name: /B · Preview/ });
  (optionB.element() as HTMLButtonElement).focus();
  await userEvent.keyboard("{Enter}");
  expect(answer).not.toHaveBeenCalled();
  await expect.element(optionB).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Send", exact: true }));
  expect(answer).toHaveBeenCalledWith({
    environmentId: "local",
    input: { cardId: "decision", revision: 1, optionId: "B" },
  });
});
