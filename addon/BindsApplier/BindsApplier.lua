-- Companion to the bind planner: paste the export's bind lines and apply them in game.
--
-- A web page cannot write the client's bindings, but the client can: SetBinding takes the same key and
-- binding names the bindings-cache.wtf export uses, so this is a paste box over that API. It applies
-- binds only; macros stay a manual job because the client makes you choose an icon index for each one.

local frame = CreateFrame("Frame", "BindsApplierFrame", UIParent)
frame:SetSize(560, 420)
frame:SetPoint("CENTER")
frame:SetFrameStrata("DIALOG")
frame:SetBackdrop({
  bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background",
  edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
  tile = true,
  tileSize = 32,
  edgeSize = 32,
  insets = { left = 11, right = 12, top = 12, bottom = 11 },
})
frame:SetMovable(true)
frame:EnableMouse(true)
frame:RegisterForDrag("LeftButton")
frame:SetScript("OnDragStart", frame.StartMoving)
frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
frame:Hide()

local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
title:SetPoint("TOP", 0, -16)
title:SetText("Binds Applier")

local hint = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
hint:SetPoint("TOPLEFT", 16, -36)
hint:SetPoint("TOPRIGHT", -16, -36)
hint:SetJustifyH("LEFT")
hint:SetText("Paste the bind lines from the planner's export, then Apply. Macros stay manual.")

local scroll = CreateFrame("ScrollFrame", "BindsApplierScroll", frame, "UIPanelScrollFrameTemplate")
scroll:SetPoint("TOPLEFT", 16, -62)
scroll:SetPoint("BOTTOMRIGHT", -34, 66)

local edit = CreateFrame("EditBox", nil, scroll)
edit:SetMultiLine(true)
edit:SetAutoFocus(false)
edit:SetFontObject(ChatFontNormal)
edit:SetWidth(500)
edit:SetHeight(280)
edit:SetScript("OnEscapePressed", function(self)
  self:ClearFocus()
end)
scroll:SetScrollChild(edit)

local status = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
status:SetPoint("BOTTOMLEFT", 16, 44)
status:SetPoint("BOTTOMRIGHT", -120, 44)
status:SetJustifyH("LEFT")
status:SetText("")

-- Every line the export writes, as the client's own binding API takes it.
local function apply(text)
  local binds, failed = 0, 0
  for line in text:gmatch("[^\r\n]+") do
    local key, binding = line:match("^%s*bind%s+(%S+)%s+(%S+)%s*$")
    if key then
      if pcall(SetBinding, key, binding) then
        binds = binds + 1
      else
        failed = failed + 1
      end
    end
  end
  local set = GetCurrentBindingSet and GetCurrentBindingSet() or 1
  pcall(SaveBindings, set)
  return binds, failed
end

local applyButton = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
applyButton:SetSize(100, 22)
applyButton:SetPoint("BOTTOMRIGHT", -80, 16)
applyButton:SetText("Apply")
applyButton:SetScript("OnClick", function()
  local binds, failed = apply(edit:GetText() or "")
  if failed > 0 then
    status:SetText(string.format("%d bind(s) applied, %d the client refused.", binds, failed))
  else
    status:SetText(string.format("%d bind(s) applied.", binds))
  end
end)

local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
close:SetPoint("TOPRIGHT", -8, -8)

SLASH_BINDSAPPLIER1 = "/bindsapplier"
SLASH_BINDSAPPLIER2 = "/binds"
SlashCmdList["BINDSAPPLIER"] = function()
  if frame:IsShown() then
    frame:Hide()
  else
    frame:Show()
    edit:SetFocus()
  end
end
