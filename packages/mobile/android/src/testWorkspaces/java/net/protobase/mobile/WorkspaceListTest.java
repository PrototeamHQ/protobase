package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.Test;

public class WorkspaceListTest {

    private static final class MapStorage implements WorkspaceStorage {
        final Map<String, String> values = new HashMap<>();

        @Override
        public String read(String key) {
            return values.get(key);
        }

        @Override
        public void write(String key, String value) {
            values.put(key, value);
        }
    }

    /** Refuses every write once `failing` is set, as SharedPreferences does when commit() returns false. */
    private static final class FailingStorage implements WorkspaceStorage {
        final MapStorage saved = new MapStorage();
        boolean failing;

        @Override
        public String read(String key) {
            return saved.read(key);
        }

        @Override
        public void write(String key, String value) throws Failed {
            if (failing) throw new Failed();
            saved.write(key, value);
        }
    }

    private final MapStorage storage = new MapStorage();
    private final WorkspaceList list = new WorkspaceList(storage);

    @Test
    public void keepsWorkspacesInTheOrderAdded() throws Exception {
        Workspace acme = list.add("https://acme.example.com", "Acme", "https://acme.example.com/icon.png");
        Workspace beta = list.add("https://beta.example.com", null, null);
        assertEquals(acme.id, UUID.fromString(acme.id).toString());
        assertNotEquals(acme.id, beta.id);
        List<Workspace> again = new WorkspaceList(storage).all();
        assertEquals(2, again.size());
        assertEquals(acme.toJson().toString(), again.get(0).toJson().toString());
        assertEquals(beta.id, again.get(1).id);
        assertNull(again.get(1).name);
        assertNull(again.get(1).icon);
        assertEquals("https://beta.example.com", list.find(beta.id).origin);
    }

    @Test
    public void refusesAnOriginListedAlready() throws Exception {
        list.add("https://acme.example.com", null, null);
        assertThrows(WorkspaceList.Listed.class, () -> list.add("https://acme.example.com", "Again", null));
    }

    @Test
    public void removingKeepsTheStoreUntilItIsDeleted() throws Exception {
        Workspace acme = list.add("https://acme.example.com", null, null);
        list.remove(acme.id);
        assertEquals(0, list.all().size());
        assertEquals(List.of(acme.id), list.removedStores());
        list.storeRemoved(acme.id);
        assertEquals(List.of(), list.removedStores());
        assertThrows(WorkspaceList.Unknown.class, () -> list.remove(acme.id));
        assertThrows(WorkspaceList.Unknown.class, () -> list.find(acme.id));
    }

    @Test
    public void reportsAChangeThatWasNotSaved() throws Exception {
        FailingStorage failing = new FailingStorage();
        WorkspaceList unsaved = new WorkspaceList(failing);
        Workspace acme = unsaved.add("https://acme.example.com", null, null);
        failing.failing = true;
        assertThrows(WorkspaceStorage.Failed.class, () -> unsaved.add("https://beta.example.com", null, null));
        assertThrows(WorkspaceStorage.Failed.class, () -> unsaved.remove(acme.id));
        assertEquals(List.of(acme.id), unsaved.all().stream().map(workspace -> workspace.id).toList());
    }
}
