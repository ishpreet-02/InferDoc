import { prisma } from "@/app/lib/prisma";
import { Dashboard } from "@/app/components/Dashboard";
import { MaintenanceManager } from "@/app/components/MaintenanceManager";

export const dynamic = "force-dynamic";

export default async function CompanyDashboard() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Company Dashboard
        </h1>
        <p className="mt-1 text-zinc-500">
          AcmeMobility · manage products and their support resources.
        </p>
      </div>
      <Dashboard products={products} />
      <div className="mt-8">
        <MaintenanceManager products={products} />
      </div>
    </div>
  );
}
