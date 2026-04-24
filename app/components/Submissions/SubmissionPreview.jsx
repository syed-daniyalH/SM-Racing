"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Paper,
  Chip,
  Grid,
  Stack,
  Modal,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";

// Icons
import CloseIcon from "@mui/icons-material/Close";
import SettingsIcon from "@mui/icons-material/Settings";
import CarIcon from "@mui/icons-material/DirectionsCar";
import PressureIcon from "@mui/icons-material/Compress";
import AlignmentIcon from "@mui/icons-material/Straighten";
import RawTextIcon from "@mui/icons-material/Description";
import TimerIcon from "@mui/icons-material/AccessTime";
import ImageElementIcon from "@mui/icons-material/Image";
import ThermostatIcon from "@mui/icons-material/Thermostat";
import InventoryIcon from "@mui/icons-material/Inventory";

const DataRow = ({ label, value, isMobile }) => (
  <TableRow
    sx={{
      "&:last-child td, &:last-child th": { border: 0 },
      "&:hover": { bgcolor: "rgba(0,0,0,0.01)" },
    }}
  >
    <TableCell
      component="th"
      scope="row"
      sx={{
        fontWeight: 600,
        color: "#666",
        width: "50%",
        fontSize: { xs: "0.7rem", sm: "0.75rem" },
        py: 0.7,
        textAlign: isMobile ? "center" : "left",
      }}
    >
      {label}
    </TableCell>
    <TableCell
      align={isMobile ? "center" : "right"}
      sx={{
        fontWeight: 700,
        fontSize: { xs: "0.7rem", sm: "0.75rem" },
        color: "#111",
        textAlign: isMobile ? "center" : "right",
      }}
    >
      {value || "-"}
    </TableCell>
  </TableRow>
);

const SectionHeader = ({ icon: Icon, title, isMobile }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: "center",
      justifyContent: isMobile ? "center" : "flex-start",
      gap: 1,
      px: 2,
      py: 1,
      bgcolor: "#f8f9fa",
      borderBottom: "2px solid #F05323",
    }}
  >
    {Icon && <Icon sx={{ color: "#F05323", fontSize: { xs: 20, sm: 18 } }} />}
    <Typography
      variant="caption"
      fontWeight={800}
      sx={{
        letterSpacing: 0.5,
        color: "#333",
        textTransform: "uppercase",
        fontSize: { xs: "0.7rem", sm: "0.7rem" },
        textAlign: "center",
      }}
    >
      {title}
    </Typography>
  </Box>
);

const formatSuspensionCorners = (suspension = {}, baseKey) => {
  const values = [
    suspension?.[`${baseKey}_fl`] ?? suspension?.[`${baseKey}_f`] ?? null,
    suspension?.[`${baseKey}_fr`] ?? suspension?.[`${baseKey}_f`] ?? null,
    suspension?.[`${baseKey}_rl`] ?? suspension?.[`${baseKey}_r`] ?? null,
    suspension?.[`${baseKey}_rr`] ?? suspension?.[`${baseKey}_r`] ?? null,
  ];

  if (!values.some((value) => value !== null && value !== undefined && value !== "")) {
    return "-";
  }

  return values
    .map((value) => (value === null || value === undefined || value === "" ? "-" : value))
    .join(" / ");
};

export default function SubmissionPreview({ data, previewId }) {
  const [openImage, setOpenImage] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (!data) return null;

  const {
    submissionId,
    eventId,
    runGroup,
    raw_text,
    image,
    data: session,
  } = data;

  return (
    <Box
      id={previewId}
      sx={{
        width: "100%",
        maxWidth: 950,
        mx: "auto",
        p: { xs: 1.5, sm: 2 },
        bgcolor: "#fff",
      }}
    >
      {/* ===== HEADER ===== */}
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          borderRadius: "12px",
          background: "linear-gradient(135deg, #F05323 0%, #ff8c00 100%)",
          color: "white",
          boxShadow: "0 4px 15px rgba(240, 83, 35, 0.2)",
          textAlign: isMobile ? "center" : "left",
        }}
      >
        <Stack
          direction={isMobile ? "column" : "row"}
          spacing={isMobile ? 1.5 : 0}
          justifyContent="space-between"
          alignItems="center"
        >
          <Box>
            <Typography
              variant={isMobile ? "h6" : "h5"}
              fontWeight={900}
              sx={{ letterSpacing: -0.5 }}
            >
              SM2 RACING{" "}
              {/* <Typography
                component="span"
                fontWeight={300}
                sx={{ opacity: 0.9 }}
              >
                | DATA HUB
              </Typography> */}
            </Typography>
            {/* <Typography
              variant="caption"
              sx={{ display: "block", opacity: 0.8, fontWeight: 500 }}
            >
              Precision Telemetry & Logistics Report
            </Typography> */}
          </Box>
          <Box sx={{ textAlign: isMobile ? "center" : "right" }}>
            {/* <Chip
              label={runGroup || "N/A"}
              size="small"
              sx={{
                bgcolor: "white",
                color: "#F05323",
                fontWeight: 900,
                mb: 0.5,
              }}
            /> */}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                mt: 0.5,
              }}
            >
              Run Group: {runGroup || "N/A"}
            </Typography>

            <Typography
              variant="caption"
              sx={{
                display: "block",
                fontWeight: 700,
                opacity: 0.9,
                fontSize: "0.65rem",
              }}
            >
              ID: {submissionId}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Grid container spacing={2}>
        {/* All Grid items follow the same logic */}
        {[
          {
            icon: CarIcon,
            title: "General Details",
            rows: [
              { label: "Event Ref", value: eventId?.slice(-8) },
              { label: "Driver ID", value: session?.driver_id },
              { label: "Vehicle ID", value: session?.vehicle_id },
              { label: "Track", value: session?.track },
            ],
          },
          {
            icon: TimerIcon,
            title: "Session Info",
            rows: [
              {
                label: "Timestamp",
                value: `${session?.date} ${session?.time}`,
              },
              { label: "Type", value: session?.session_type },
              { label: "Number", value: `Run #${session?.session_number}` },
              { label: "Duration", value: `${session?.duration_min} min` },
            ],
          },
          {
            icon: PressureIcon,
            title: `Pressure (${session?.pressures?.unit})`,
            rows: [
              {
                label: "Front (L/R)",
                value: `${session?.pressures?.cold?.fl} / ${session?.pressures?.cold?.fr}`,
              },
              {
                label: "Rear (L/R)",
                value: `${session?.pressures?.cold?.rl} / ${session?.pressures?.cold?.rr}`,
              },
            ],
          },
          {
            icon: SettingsIcon,
            title: "Suspension",
            rows: [
              {
                label: "Rebound (FL/FR/RL/RR)",
                value: formatSuspensionCorners(session?.suspension, "rebound"),
              },
              {
                label: "Bump (FL/FR/RL/RR)",
                value: formatSuspensionCorners(session?.suspension, "bump"),
              },
              {
                label: "Sway Bar (F/R)",
                value: `${session?.suspension?.sway_bar_f ?? "-"} / ${session?.suspension?.sway_bar_r ?? "-"}`,
              },
              {
                label: "Wing Angle",
                value:
                  session?.suspension?.wing_angle_deg !== undefined &&
                  session?.suspension?.wing_angle_deg !== null
                    ? `${session.suspension.wing_angle_deg} deg`
                    : "-",
              },
            ],
          },
          {
            icon: ThermostatIcon,
            title: "Tire Temps",
            rows: [
              {
                label: "Front Left",
                value: `${session?.tire_temperatures?.fl_out}/${session?.tire_temperatures?.fl_mid}/${session?.tire_temperatures?.fl_in}`,
              },
              {
                label: "Front Right",
                value: `${session?.tire_temperatures?.fr_out}/${session?.tire_temperatures?.fr_mid}/${session?.tire_temperatures?.fr_in}`,
              },
            ],
          },
          {
            icon: InventoryIcon,
            title: "Tire Inventory",
            rows: [
              { label: "Model", value: session?.tire_inventory?.model },
              {
                label: "Heat Cycles",
                value: session?.tire_inventory?.heat_cycles,
              },
              { label: "Status", value: session?.tire_inventory?.status },
            ],
          },
        ].map((section, idx) => (
          <Grid item xs={12} sm={6} key={idx} sx={{ display: "flex" }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                width: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <SectionHeader
                icon={section.icon}
                title={section.title}
                isMobile={isMobile}
              />
              <Table size="small">
                <TableBody>
                  {section.rows.map((row, rIdx) => (
                    <DataRow
                      key={rIdx}
                      label={row.label}
                      value={row.value}
                      isMobile={isMobile}
                    />
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        ))}

        {/* ALIGNMENT (Special Case for Full Width) */}
        <Grid item xs={12}>
          <Paper
            variant="outlined"
            sx={{ borderRadius: 2, overflow: "hidden" }}
          >
            <SectionHeader
              icon={AlignmentIcon}
              title="Chassis Alignment & Balance"
              isMobile={isMobile}
            />
            <Grid container>
              <Grid
                item
                xs={12}
                sm={6}
                sx={{
                  borderRight: { sm: "1px solid #eee" },
                  borderBottom: { xs: "1px solid #eee", sm: "none" },
                }}
              >
                <Table size="small">
                  <TableBody>
                    <DataRow
                      label="Camber Front"
                      value={`${session?.alignment?.camber_fl} / ${session?.alignment?.camber_fr}`}
                      isMobile={isMobile}
                    />
                    <DataRow
                      label="Cross Weight"
                      value={`${session?.alignment?.cross_weight_pct}%`}
                      isMobile={isMobile}
                    />
                  </TableBody>
                </Table>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Table size="small">
                  <TableBody>
                    <DataRow
                      label="Camber Rear"
                      value={`${session?.alignment?.camber_rl} / ${session?.alignment?.camber_rr}`}
                      isMobile={isMobile}
                    />
                    <DataRow
                      label="Rake Height"
                      value={`${session?.alignment?.rake_mm} mm`}
                      isMobile={isMobile}
                    />
                  </TableBody>
                </Table>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* IMAGE & RAW TEXT */}
        <Grid
          item
          xs={12}
          md={8}
          sx={{ display: "flex", order: { xs: 2, md: 1 } }}
        >
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2,
              overflow: "hidden",
              width: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <SectionHeader
              icon={RawTextIcon}
              title="Raw Input Verification"
              isMobile={isMobile}
            />
            <Box
              sx={{
                p: 2,
                bgcolor: "#fafafa",
                flexGrow: 1,
                textAlign: isMobile ? "center" : "left",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  color: "#666",
                  lineHeight: 1.5,
                  wordBreak: "break-all",
                }}
              >
                {raw_text}
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid
          item
          xs={12}
          md={4}
          sx={{ display: "flex", order: { xs: 1, md: 2 } }}
        >
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 2,
              overflow: "hidden",
              width: "100%",
              textAlign: "center",
              cursor: image ? "pointer" : "default",
            }}
            onClick={() => image && setOpenImage(true)}
          >
              <SectionHeader
                icon={ImageElementIcon}
                title="Proof Attachment"
                isMobile={isMobile}
              />
              {image ? (
                <Box
                  sx={{
                    position: "relative",
                    width: "100%",
                    height: { xs: 200, sm: 130 },
                  }}
                >
                  <Image
                    src={image}
                    alt="Proof attachment"
                    fill
                    unoptimized
                    sizes="(max-width: 600px) 100vw, 50vw"
                    style={{ objectFit: "cover" }}
                  />
                </Box>
              ) : (
                <Box sx={{ py: 4, color: "#ccc" }}>
                  <ImageElementIcon sx={{ fontSize: 40 }} />
                <Typography variant="caption" sx={{ display: "block" }}>
                  No Image Uploaded
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* LIGHTBOX */}
      <Modal
        open={openImage}
        onClose={() => setOpenImage(false)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
        }}
      >
        <Box sx={{ position: "relative", outline: "none", maxWidth: "100%" }}>
          <IconButton
            onClick={() => setOpenImage(false)}
            sx={{ position: "absolute", top: -45, right: 0, color: "#fff" }}
          >
            <CloseIcon />
          </IconButton>
          <Box sx={{ position: "relative", width: "90vw", maxWidth: "1000px", height: "85vh" }}>
            <Image
              src={image}
              alt="Proof"
              fill
              unoptimized
              sizes="90vw"
              style={{
                objectFit: "contain",
                borderRadius: "8px",
              }}
            />
          </Box>
        </Box>
      </Modal>
    </Box>
  );
}
