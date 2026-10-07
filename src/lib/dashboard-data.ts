export type Metric = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
};

export type Campaign = {
  name: string;
  delivered: number;
  opens: number;
  clicks: number;
  revenue: string;
  status: "actief" | "wachtend" | "gearchiveerd";
};

export const overviewMetrics: Record<string, Metric[]> = {
  platform: [
    { label: "Verzonden e-mails", value: "1.28M", delta: "+18.4%", trend: "up" },
    { label: "Open rate", value: "42.7%", delta: "+2.9%", trend: "up" },
    { label: "Click-through rate", value: "6.8%", delta: "+0.7%", trend: "up" },
    { label: "Revenue attribution", value: "€68.4K", delta: "+12.1%", trend: "up" },
  ],
  northwind: [
    { label: "Verzonden e-mails", value: "184K", delta: "+14.2%", trend: "up" },
    { label: "Open rate", value: "46.1%", delta: "+3.6%", trend: "up" },
    { label: "Click-through rate", value: "7.4%", delta: "+1.1%", trend: "up" },
    { label: "Revenue attribution", value: "€12.6K", delta: "+9.8%", trend: "up" },
  ],
  bluebird: [
    { label: "Verzonden e-mails", value: "128K", delta: "+8.7%", trend: "up" },
    { label: "Open rate", value: "39.8%", delta: "+1.2%", trend: "up" },
    { label: "Click-through rate", value: "5.9%", delta: "+0.3%", trend: "up" },
    { label: "Revenue attribution", value: "€9.1K", delta: "+4.2%", trend: "up" },
  ],
};

export const campaigns: Record<string, Campaign[]> = {
  platform: [
    { name: "Heractie klanten - Q4", delivered: 320000, opens: 140000, clicks: 23000, revenue: "€19.8K", status: "actief" },
    { name: "Productlaunch B2B", delivered: 210000, opens: 89000, clicks: 11400, revenue: "€16.2K", status: "actief" },
    { name: "Win-back segment", delivered: 65000, opens: 26600, clicks: 3200, revenue: "€7.4K", status: "wachtend" },
  ],
  northwind: [
    { name: "Nieuwe collectie", delivered: 62000, opens: 28800, clicks: 4920, revenue: "€5.1K", status: "actief" },
    { name: "Retargeting", delivered: 45000, opens: 19300, clicks: 3100, revenue: "€3.8K", status: "actief" },
    { name: "Persoonlijke aanbeveling", delivered: 32000, opens: 13680, clicks: 1880, revenue: "€2.7K", status: "gearchiveerd" },
  ],
  bluebird: [
    { name: "Welkomstserie", delivered: 39000, opens: 15170, clicks: 2380, revenue: "€2.4K", status: "actief" },
    { name: "Verkoopcampagne", delivered: 33000, opens: 12800, clicks: 1860, revenue: "€2.6K", status: "wachtend" },
    { name: "Nieuwsbrief", delivered: 28000, opens: 11000, clicks: 1380, revenue: "€1.8K", status: "actief" },
  ],
};

export const tenantOverview = [
  { id: "northwind", name: "Northwind B.V.", owner: "Marketing team", delivered: 184000, opens: 84600, ctr: 7.4, health: "Excellent" },
  { id: "bluebird", name: "Bluebird Retail", owner: "CRM team", delivered: 128000, opens: 51000, ctr: 5.9, health: "Goed" },
  { id: "harbor", name: "Harbor Logistics", owner: "Customer success", delivered: 96000, opens: 35400, ctr: 6.2, health: "Goed" },
];
