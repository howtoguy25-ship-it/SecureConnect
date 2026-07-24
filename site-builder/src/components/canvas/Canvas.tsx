import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Project } from '@/types';
import DraggableElement from '@/components/canvas/DraggableElement';
import AnnouncementBarView from '@/components/canvas/AnnouncementBarView';
import RichTextView from '@/components/policy/RichTextView';
import { gradientStartEnd } from '@/utils/gradient';

// The same real header chrome every published page gets automatically (see
// renderHeaderBarHtml in siteHtml.ts) -- hamburger, logo/site name, search/cart icons --
// shown live while building, matching the published layout exactly. The hamburger opens a
// preview of the real resolved menu (same items renderMenuHtml would show); search/cart are
// shown as real icons but aren't interactive here since there's no running cart/search
// runtime until the site is actually published -- this is a design canvas, not a browser.
function HeaderBarPreview({ project, width, hasProducts }: { project: Project; width: number; hasProducts: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dividerColor = project.headerDividerColor || '#E2E8F0';
  const logoHeight = project.logoHeightPx || 32;
  const customItems = project.menu?.enabled ? project.menu.items : [];
  const hasPolicies = (project.policies?.length ?? 0) > 0;
  const hasMenu = !!project.pages?.length || hasProducts || customItems.length > 0 || hasPolicies;

  return (
    <View style={[styles.headerBar, { width, borderBottomColor: dividerColor }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => hasMenu && setMenuOpen(true)}
          style={[styles.headerMenuBtn, !hasMenu && { opacity: 0.35 }]}
          hitSlop={8}
        >
          <Ionicons name="menu" size={20} color="#fff" />
        </Pressable>
        <View style={styles.headerBrand}>
          {project.logoUrl ? (
            <Image
              source={{ uri: project.logoUrl }}
              resizeMode={project.logoFit === 'cover' ? 'cover' : 'contain'}
              style={{ height: logoHeight, width: logoHeight * 3 }}
            />
          ) : (
            <Text style={styles.headerBrandText} numberOfLines={1}>
              {project.name.toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.headerIcons}>
          {hasProducts && <Ionicons name="search-outline" size={18} color="#0F172A" />}
          {hasProducts && <Ionicons name="bag-outline" size={19} color="#0F172A" />}
        </View>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.policyModalBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuPreviewCard}>
            <View style={styles.policyModalHeader}>
              <Text style={styles.policyModalTitle}>Menu</Text>
              <Pressable hitSlop={8} onPress={() => setMenuOpen(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>
            {!!project.pages?.length && <Text style={styles.menuPreviewRow}>Home</Text>}
            {hasProducts && <Text style={styles.menuPreviewRow}>🛍️ Catalog</Text>}
            {customItems.map((item) => (
              <Text key={item.id} style={styles.menuPreviewRow} numberOfLines={1}>
                {item.label}
              </Text>
            ))}
            {hasPolicies && <Text style={styles.menuPreviewRow}>Policies</Text>}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// The same real, evenly-spaced policy button row every published page gets automatically
// (see renderPolicyFooterHtml in siteHtml.ts) -- shown live while building, not just after
// publish, so "lock the page to see how it really looks" is true for this too. Tapping a
// button previews that policy's real written content right here, since there's no live
// published URL to open until the site is actually published.
function PolicyFooterBar({ project, width }: { project: Project; width: number }) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const policies = project.policies ?? [];
  if (policies.length === 0) return null;
  const viewing = policies.find((p) => p.id === viewingId) ?? null;

  return (
    <View style={[styles.footer, { width }]}>
      {policies.map((p) => (
        <Pressable key={p.id} style={styles.footerBtn} onPress={() => setViewingId(p.id)}>
          <Text style={styles.footerBtnText} numberOfLines={1}>
            {p.title}
          </Text>
        </Pressable>
      ))}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewingId(null)}>
        <View style={styles.policyModalBackdrop}>
          <View style={styles.policyModalCard}>
            <View style={styles.policyModalHeader}>
              <Text style={styles.policyModalTitle} numberOfLines={1}>
                {viewing?.title}
              </Text>
              <Pressable hitSlop={8} onPress={() => setViewingId(null)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>
            <ScrollView>{viewing && <RichTextView paragraphs={viewing.paragraphs} />}</ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// A dashed, translucent preview of the real "Built by SiteSpark" badge every published site
// gets automatically (see renderProjectHtml in siteHtml.ts) -- shown live while building so
// there's no surprise about it after publishing. It only ever appears once for the whole
// site, at the very end (the last page, or the only page), matching the real publish output.
function SiteSparkBadgePreview({ width, isLastPage }: { width: number; isLastPage: boolean }) {
  return (
    <View style={[styles.badgePreview, { width }]}>
      <Text style={styles.badgePreviewText} numberOfLines={2}>
        {isLastPage
          ? '"Built by SiteSpark" will be shown here automatically once published'
          : '"Built by SiteSpark" appears once, at the end of your site (not on this page)'}
      </Text>
    </View>
  );
}

// A real "+" that extends this page with more empty room to build into, positioned right at
// the bottom of the canvas content itself (in normal document flow, sized as its own full-
// width row) so it can never float on top of -- or get floated on top of by -- anything else,
// unlike a screen-fixed FAB would.
function ExtendCanvasButton({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <Pressable style={[styles.extendBtn, { width }]} onPress={onPress}>
      <Ionicons name="add-circle" size={22} color="#4338CA" />
      <Text style={styles.extendBtnText}>Add more to this page</Text>
    </Pressable>
  );
}

interface Props {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: any) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
  onInteractionChange?: (interacting: boolean) => void;
  // Page-level view lock -- see DraggableElement's forceLocked comment.
  forceLocked?: boolean;
  // See DraggableElement's onOpenLink comment.
  onOpenLink?: (link: string) => void;
  // Fires when a locked button links to another element on this page (a Product/Collection)
  // -- lets the caller reveal it (e.g. scroll it into view) without necessarily also opening
  // it for editing the way a normal onSelect would. Falls back to onSelect if omitted.
  onNavigateToElement?: (id: string) => void;
  // Fires (in addition to deselecting) when the empty canvas background itself is tapped --
  // lets a tap on the page background double as a shortcut into the background color/gradient
  // editor, instead of requiring the header's palette icon every time.
  onBackgroundTap?: () => void;
  // Whether the page currently being edited is the site's last (or only) page -- see
  // SiteSparkBadgePreview. Defaults true (matches every single-page project).
  isLastPage?: boolean;
  // Fires when the "+" below the canvas is tapped -- see EditorScreen's extendCanvas.
  // Omitted (no button rendered) wherever there's no editor to extend into, e.g. a locked
  // read-only preview.
  onExtend?: () => void;
}

export default function Canvas({
  project,
  selectedId,
  onSelect,
  onChange,
  onDuplicate,
  onDelete,
  onToggleLock,
  onInteractionChange,
  forceLocked,
  onOpenLink,
  onNavigateToElement,
  onBackgroundTap,
  isLastPage = true,
  onExtend,
}: Props) {
  const sorted = [...project.elements].sort((a, b) => a.zIndex - b.zIndex);
  const sizeStyle = { width: project.canvasSize.width, height: project.canvasSize.height };
  const hasProducts = project.elements.some((el) => el.type === 'product');

  const content = (
    <>
      <AnnouncementBarView settings={project.announcements} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          // First tap on the background just deselects whatever was selected (so you can tap
          // away from an element you were editing without anything else popping up). Only once
          // nothing is selected does tapping the bare background double as "edit this page's
          // background color" -- keeps the shortcut from feeling like it hijacks every deselect.
          if (selectedId) onSelect(null);
          else onBackgroundTap?.();
        }}
      />
      {sorted.map((el) => (
        <DraggableElement
          key={el.id}
          element={el}
          allElements={project.elements}
          isSelected={el.id === selectedId}
          onSelect={() => onSelect(el.id)}
          onChange={(patch) => onChange(el.id, patch)}
          onDuplicate={() => onDuplicate(el.id)}
          onDelete={() => onDelete(el.id)}
          onToggleLock={() => onToggleLock(el.id)}
          canvasSize={project.canvasSize}
          onInteractionChange={onInteractionChange}
          forceLocked={forceLocked}
          onNavigateToElement={onNavigateToElement ?? onSelect}
          onOpenLink={onOpenLink}
        />
      ))}
    </>
  );

  if (project.backgroundGradient) {
    const { start, end } = gradientStartEnd(project.backgroundGradient.angle);
    return (
      <View>
        <HeaderBarPreview project={project} width={project.canvasSize.width} hasProducts={hasProducts} />
        <LinearGradient colors={project.backgroundGradient.colors} start={start} end={end} style={[styles.canvas, sizeStyle, styles.canvasBelowHeader]}>
          {content}
        </LinearGradient>
        {onExtend && <ExtendCanvasButton width={project.canvasSize.width} onPress={onExtend} />}
        <PolicyFooterBar project={project} width={project.canvasSize.width} />
        <SiteSparkBadgePreview width={project.canvasSize.width} isLastPage={isLastPage} />
      </View>
    );
  }

  return (
    <View>
      <HeaderBarPreview project={project} width={project.canvasSize.width} hasProducts={hasProducts} />
      <View style={[styles.canvas, sizeStyle, styles.canvasBelowHeader, { backgroundColor: project.backgroundColor }]}>{content}</View>
      {onExtend && <ExtendCanvasButton width={project.canvasSize.width} onPress={onExtend} />}
      <PolicyFooterBar project={project} width={project.canvasSize.width} />
      <SiteSparkBadgePreview width={project.canvasSize.width} isLastPage={isLastPage} />
    </View>
  );
}

const styles = StyleSheet.create({
  extendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: '#EEF2FF',
    borderTopWidth: 1,
    borderTopColor: '#E0E7FF',
  },
  extendBtnText: { fontSize: 14, fontWeight: '700', color: '#4338CA' },
  badgePreview: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#94A3B8',
    backgroundColor: '#94A3B822',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  badgePreviewText: { fontSize: 11, color: '#64748B', textAlign: 'center', fontStyle: 'italic' },
  headerBar: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomWidth: 1,
    overflow: 'hidden',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  headerMenuBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  headerBrand: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerBrandText: { fontSize: 14, fontWeight: '800', letterSpacing: 1, color: '#0F172A' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 34, justifyContent: 'flex-end' },
  menuPreviewCard: {
    alignSelf: 'flex-start',
    marginTop: 60,
    marginLeft: 16,
    width: '78%',
    maxWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  menuPreviewRow: { fontSize: 13, fontWeight: '600', color: '#0F172A', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  canvasBelowHeader: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  canvas: {
    overflow: 'hidden',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  footerBtn: { flex: 1, minWidth: 80, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' },
  footerBtnText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  policyModalBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  policyModalCard: { width: '100%', maxWidth: 420, maxHeight: '75%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18 },
  policyModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  policyModalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', flex: 1, marginRight: 10 },
});
