import process from "process";
import { shareMaterial } from "../uploader.js";

const [keyword, tenantId, tenantType = "10022"] = process.argv.slice(2);

const shareTo = tenantId
  ? {
      tenant_type: Number(tenantType),
      tenant_id: tenantId,
    }
  : undefined;

const filter = keyword ? { keyword } : {};

try {
  const result = await shareMaterial(shareTo, filter);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error.response) {
    console.error(
      JSON.stringify(
        {
          status: error.response.status,
          data: error.response.data,
        },
        null,
        2
      )
    );
  } else {
    console.error(error.message);
  }
  process.exit(1);
}
