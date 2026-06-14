import { prisma } from "@/app/lib/prisma";
import { Dashboard } from "@/app/components/Dashboard";
import { MaintenanceManager } from "@/app/components/MaintenanceManager";
import { WarrantyRecallManager } from "@/app/components/WarrantyRecallManager";
import { ProductHealthPanel } from "@/app/components/ProductHealthPanel";

export const dynamic = "force-dynamic";

export default async function CompanyDashboard() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, warrantyMonths: true },
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
        <ProductHealthPanel products={products} />
      </div>
      <div className="mt-8">
        <MaintenanceManager products={products} />
      </div>
      <div className="mt-8">
        <WarrantyRecallManager products={products} />
      </div>
    </div>
  );
}
